import { describe, it, expect, afterEach, vi } from 'vitest'
import { company } from '../../company'
import {
  canQuoteLiveRates,
  courierClient,
  couriersWithOfficeLookup,
  econtEnvironment,
  econtShipFrom,
  isCourierConfigured,
  missingCourierCredentials,
  missingLiveRateRequirements,
} from '..'

/**
 * Courier resolution and environment gating (AUDIT.md Q-22).
 *
 * The gate is the point of these tests. Everything else here degrades politely;
 * this is the one decision where getting it wrong sends a paying customer to an
 * office named `testtest`.
 *
 * `vi.stubEnv` rather than assigning `process.env` directly, so
 * `vi.unstubAllEnvs` restores whatever the runner set — including `NODE_ENV`,
 * which vitest itself depends on.
 */

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('econtEnvironment', () => {
  it('is production with nothing configured, because the office list is public', () => {
    // The default state of any fresh clone: real offices, no setup. Credentials
    // buy waybills, not the nomenclature.
    expect(econtEnvironment()).toBe('production')
  })

  it('stays production when credentials are present', () => {
    vi.stubEnv('ECONT_USERNAME', 'merchant')
    vi.stubEnv('ECONT_PASSWORD', 'secret')

    expect(econtEnvironment()).toBe('production')
  })

  it('is unaffected by half-configured credentials', () => {
    // A typo in one variable used to take the whole picker down. It no longer
    // can, because the lookup does not authenticate.
    vi.stubEnv('ECONT_USERNAME', 'merchant')

    expect(econtEnvironment()).toBe('production')
  })

  it('is demo when ECONT_ENV asks for it', () => {
    vi.stubEnv('ECONT_ENV', 'demo')

    expect(econtEnvironment()).toBe('demo')
  })

  it('refuses demo data in production, loudly, and uses the real list instead', () => {
    // The single most expensive misconfiguration available here: a live
    // storefront listing offices that do not exist. Falling back is safe now —
    // the real list needs no credentials — so the picker keeps working.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ECONT_ENV', 'demo')

    expect(econtEnvironment()).toBe('production')
    expect(error).toHaveBeenCalledWith(expect.stringContaining('ECONT_ENV=demo'))
  })

  it('ignores an unrecognised ECONT_ENV value rather than guessing', () => {
    vi.stubEnv('ECONT_ENV', 'staging')

    expect(econtEnvironment()).toBe('production')
  })
})

describe('couriersWithOfficeLookup', () => {
  it('offers Econt with no configuration at all', () => {
    expect(couriersWithOfficeLookup()).toEqual(['econt'])
  })

  it('offers Econt on the demo environment too', () => {
    vi.stubEnv('ECONT_ENV', 'demo')

    expect(couriersWithOfficeLookup()).toEqual(['econt'])
  })

  it('does not offer Speedy on the strength of its credentials alone', () => {
    // Its client is still a stub, so listing it would render a picker that can
    // only ever say "unavailable".
    vi.stubEnv('SPEEDY_USERNAME', 'merchant')
    vi.stubEnv('SPEEDY_PASSWORD', 'secret')

    expect(couriersWithOfficeLookup()).not.toContain('speedy')
  })
})

describe('courierClient', () => {
  it('answers unconfigured for Speedy, credentials or not', async () => {
    vi.stubEnv('SPEEDY_USERNAME', 'merchant')
    vi.stubEnv('SPEEDY_PASSWORD', 'secret')

    const speedy = courierClient('speedy')

    expect(speedy.courier).toBe('speedy')
    expect(await speedy.searchCities('София')).toEqual({
      status: 'unconfigured',
      courier: 'speedy',
    })
    expect(await speedy.officesIn('41', 'office')).toEqual({
      status: 'unconfigured',
      courier: 'speedy',
    })
    expect(await speedy.findOffice('1012')).toEqual({
      status: 'unconfigured',
      courier: 'speedy',
    })
  })

  it('gives Econt a real client with nothing configured, and calls the public list', async () => {
    // The whole point of the credential-free design: a fresh clone queries the
    // real nomenclature. `unconfigured` is no longer reachable for Econt.
    // Typed parameters so `mock.calls[0][0]` is the URL rather than `never`.
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ offices: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await courierClient('econt').searchCities('София')

      expect(result.status).not.toBe('unconfigured')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0][0]).toContain('ee.econt.com')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('points at the demo host when asked, and only then', async () => {
    // The one thing ECONT_ENV still decides.
    // Typed parameters so `mock.calls[0][0]` is the URL rather than `never`.
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ offices: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('ECONT_ENV', 'demo')

    try {
      await courierClient('econt').searchCities('София')

      expect(fetchMock.mock.calls[0][0]).toContain('demo.econt.com')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reuses one client per environment, so the office cache survives', () => {
    // A fresh client per request would re-download 1.7 MB on every keystroke's
    // worth of city search.
    vi.stubEnv('ECONT_ENV', 'demo')

    expect(courierClient('econt')).toBe(courierClient('econt'))
  })

  it('keeps the demo and production clients apart, so their caches cannot mix', () => {
    vi.stubEnv('ECONT_ENV', 'demo')
    const demo = courierClient('econt')

    vi.stubEnv('ECONT_ENV', '')
    expect(courierClient('econt')).not.toBe(demo)
  })
})

describe('the launch checklist', () => {
  it('reports both couriers as unconfigured while credentials are missing', () => {
    expect(isCourierConfigured('econt')).toBe(false)
    expect(isCourierConfigured('speedy')).toBe(false)
    expect(missingCourierCredentials()).toEqual([
      'ECONT_USERNAME',
      'ECONT_PASSWORD',
      'SPEEDY_USERNAME',
      'SPEEDY_PASSWORD',
    ])
  })

  it('stops naming a variable once it is set', () => {
    vi.stubEnv('ECONT_USERNAME', 'merchant')
    vi.stubEnv('ECONT_PASSWORD', 'secret')

    expect(isCourierConfigured('econt')).toBe(true)
    expect(missingCourierCredentials()).toEqual(['SPEEDY_USERNAME', 'SPEEDY_PASSWORD'])
  })

  it('does not count ECONT_ENV=demo as configured credentials', () => {
    // `isCourierConfigured` answers "is there a contract", which the demo
    // environment is not. `econtEnvironment()` is the question about whether we
    // can look offices up.
    vi.stubEnv('ECONT_ENV', 'demo')

    expect(isCourierConfigured('econt')).toBe(false)
    expect(missingCourierCredentials()).toContain('ECONT_USERNAME')
  })
})

describe('the hand-over point', () => {
  it('is unset out of the box, so nothing can be priced from a guess', () => {
    // The registered seat in `company.ts` is still `[TODO: …]`, and the same
    // parcel costs a different amount posted from an office than collected from
    // an address — so "no sender configured" has to mean "cannot quote", not a
    // default.
    expect(econtShipFrom()).toBeNull()
    expect(canQuoteLiveRates('econt')).toBe(false)
  })

  it('uses the office the merchant drops parcels at, when one is named', () => {
    vi.stubEnv('ECONT_SENDER_OFFICE_CODE', '1120')

    expect(econtShipFrom()).toEqual({ officeCode: '1120' })
  })

  it('prefers that office over a collection address, rather than merging them', () => {
    // A parcel leaves from one place. Sending both would let Econt pick.
    vi.stubEnv('ECONT_SENDER_OFFICE_CODE', '1120')
    vi.stubEnv('ECONT_SENDER_CITY', 'София')
    vi.stubEnv('ECONT_SENDER_POST_CODE', '1000')
    vi.stubEnv('ECONT_SENDER_STREET', 'бул. Витоша 10')

    expect(econtShipFrom()).toEqual({ officeCode: '1120' })
  })

  it('takes a collection address only when all three parts are there', () => {
    vi.stubEnv('ECONT_SENDER_CITY', 'София')
    vi.stubEnv('ECONT_SENDER_POST_CODE', '1000')

    // Two thirds of an address is not an address, and Econt would reject it.
    expect(econtShipFrom()).toBeNull()

    vi.stubEnv('ECONT_SENDER_STREET', 'бул. Витоша 10')

    expect(econtShipFrom()).toEqual({
      city: 'София',
      postCode: '1000',
      street: 'бул. Витоша 10',
    })
  })

  it('falls back to the registered seat once the owner fills it in', () => {
    // Mutating the constant is the only way to model "the owner answered", and
    // it is restored below. The point is that filling in the impressum is enough
    // — a home business hands parcels over where it is registered.
    const seat = company.address as unknown as Record<string, string>
    const before = { ...seat }

    Object.assign(seat, { street: 'ул. Пример 1', city: 'София', postalCode: '1000' })

    try {
      expect(econtShipFrom()).toEqual({
        city: 'София',
        postCode: '1000',
        street: 'ул. Пример 1',
      })
    } finally {
      Object.assign(seat, before)
    }
  })
})

describe('whether a courier can quote a real price', () => {
  it('needs both credentials and a hand-over point', () => {
    vi.stubEnv('ECONT_USERNAME', 'merchant')
    vi.stubEnv('ECONT_PASSWORD', 'secret')

    // Credentials alone buy an authenticated call for a parcel posted from
    // nowhere.
    expect(canQuoteLiveRates('econt')).toBe(false)
    expect(missingLiveRateRequirements()).toEqual([
      'ECONT_SENDER_OFFICE_CODE or the registered address in company.ts',
    ])

    vi.stubEnv('ECONT_SENDER_OFFICE_CODE', '1120')

    expect(canQuoteLiveRates('econt')).toBe(true)
    expect(missingLiveRateRequirements()).toEqual([])
  })

  it('names the credentials that are missing while the sender is set', () => {
    vi.stubEnv('ECONT_SENDER_OFFICE_CODE', '1120')

    expect(missingLiveRateRequirements()).toEqual(['ECONT_USERNAME', 'ECONT_PASSWORD'])
  })

  it('is false for Speedy however much is configured', () => {
    // Its client is a stub, so there is nothing to ask.
    vi.stubEnv('SPEEDY_USERNAME', 'merchant')
    vi.stubEnv('SPEEDY_PASSWORD', 'secret')
    vi.stubEnv('ECONT_SENDER_OFFICE_CODE', '1120')

    expect(canQuoteLiveRates('speedy')).toBe(false)
  })
})

describe('the Speedy stub', () => {
  it('answers unconfigured when asked for a price, rather than a number', async () => {
    expect(await courierClient('speedy').priceShipment({
      method: 'office',
      officeId: '1012',
      weightGrams: 550,
      codAmount: null,
    })).toEqual({ status: 'unconfigured', courier: 'speedy' })
  })
})
