import { describe, it, expect, afterEach, vi } from 'vitest'
import { company } from '../../company'
import {
  canBookWaybills,
  canQuoteLiveRates,
  courierClient,
  couriersWithOfficeLookup,
  econtCodPayout,
  econtEnvironment,
  econtSender,
  econtShipFrom,
  isCourierConfigured,
  missingCourierCredentials,
  missingLiveRateRequirements,
  missingWaybillRequirements,
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

/**
 * Runs `body` with the registered seat overridden, then restores it.
 *
 * Mutating the frozen-by-convention constant is the only way to model "the seat is
 * not filled in", which is no longer the default state — and the restore matters,
 * because a leaked override would silently change every later test's sender.
 */
function withSeat(patch: Record<string, string>, body: () => void) {
  const seat = company.address as unknown as Record<string, string>
  const before = { ...seat }

  Object.assign(seat, patch)
  try {
    body()
  } finally {
    Object.assign(seat, before)
  }
}

describe('the hand-over point', () => {
  it('defaults to the registered seat, now that the owner has supplied one', () => {
    // A home business hands parcels over where it is registered, so filling in the
    // impressum is enough to price from. Asserted against `company.address` rather
    // than against literals: this is about the wiring, and the seat's own values
    // are asserted in the impressum tests.
    expect(econtShipFrom()).toEqual({
      city: company.address.city,
      postCode: company.address.postalCode,
      street: company.address.street,
    })
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

    // Two thirds of an address is not an address, and Econt would reject it — so
    // the partial override is ignored in favour of the seat rather than being
    // patched up with the seat's street, which would be a third address that
    // exists nowhere.
    expect(econtShipFrom()).toEqual({
      city: company.address.city,
      postCode: company.address.postalCode,
      street: company.address.street,
    })

    vi.stubEnv('ECONT_SENDER_STREET', 'бул. Витоша 10')

    expect(econtShipFrom()).toEqual({
      city: 'София',
      postCode: '1000',
      street: 'бул. Витоша 10',
    })
  })

  it('quotes nothing at all if the seat is ever emptied back to a marker', () => {
    // The guard that used to be the out-of-the-box case. The same parcel costs a
    // different amount posted from an office than collected from an address, so
    // "nowhere to post from" has to mean "cannot quote" rather than a default —
    // and that has to stay true if someone clears the impressum again.
    withSeat({ street: '[TODO: street and number]' }, () => {
      expect(econtShipFrom()).toBeNull()
      expect(canQuoteLiveRates('econt')).toBe(false)
    })
  })
})

describe('whether a courier can quote a real price', () => {
  it('needs both credentials and a hand-over point', () => {
    vi.stubEnv('ECONT_USERNAME', 'merchant')
    vi.stubEnv('ECONT_PASSWORD', 'secret')

    // The registered seat supplies the hand-over point, so credentials are the
    // last thing needed.
    expect(canQuoteLiveRates('econt')).toBe(true)
    expect(missingLiveRateRequirements()).toEqual([])

    // Without one, credentials alone buy an authenticated call for a parcel posted
    // from nowhere.
    withSeat({ city: '[TODO: city]' }, () => {
      expect(canQuoteLiveRates('econt')).toBe(false)
      expect(missingLiveRateRequirements()).toEqual([
        'ECONT_SENDER_OFFICE_CODE or the registered address in company.ts',
      ])
    })
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

describe('who the parcel is from', () => {
  it('is nobody without a phone, because Econt refuses a label without one', () => {
    // `company.contact.phone` is deliberately null — the owner does not publish
    // their number — so the phone can only come from configuration.
    expect(econtSender()).toBeNull()
  })

  it('defaults the name to the legal entity, which is the name on the invoice', () => {
    vi.stubEnv('ECONT_SENDER_PHONE', '+359888123456')

    expect(econtSender()).toEqual({ name: company.legalName, phone: '+359888123456' })
  })

  it('takes a different sender name when one is configured', () => {
    vi.stubEnv('ECONT_SENDER_PHONE', '+359888123456')
    vi.stubEnv('ECONT_SENDER_NAME', '55° свещи')

    expect(econtSender()).toEqual({ name: '55° свещи', phone: '+359888123456' })
  })
})

describe('where the наложен платеж money goes', () => {
  it('is unset by default, which means Econt\u2019s own arrangement, not an error', () => {
    // A personal профил pays out at an office counter. That works; it is just not
    // automatic, so it must not read as a misconfiguration.
    expect(econtCodPayout()).toBeNull()
  })

  it('prefers the profile template, so the IBAN never travels in a request', () => {
    vi.stubEnv('ECONT_COD_PAY_TEMPLATE', 'ШН0022')
    vi.stubEnv('ECONT_COD_IBAN', 'BG18RZBB91550123456789')
    vi.stubEnv('ECONT_COD_BIC', 'RZBBBGSF')

    expect(econtCodPayout()).toEqual({ template: 'ШН0022' })
  })

  it('sends the account when there is no template', () => {
    vi.stubEnv('ECONT_COD_IBAN', 'BG18RZBB91550123456789')
    vi.stubEnv('ECONT_COD_BIC', 'RZBBBGSF')

    expect(econtCodPayout()).toEqual({
      method: 'bank',
      iban: 'BG18RZBB91550123456789',
      bic: 'RZBBBGSF',
      currency: 'EUR',
    })
  })

  it('ignores half an arrangement rather than failing the booking with it', () => {
    // Econt rejects an IBAN without a BIC. Falling back to the profile default
    // books the parcel; sending the half would lose it.
    vi.stubEnv('ECONT_COD_IBAN', 'BG18RZBB91550123456789')

    expect(econtCodPayout()).toBeNull()
  })
})

describe('whether a courier can issue a real waybill', () => {
  it('needs everything pricing needs, plus a sender', () => {
    vi.stubEnv('ECONT_USERNAME', 'merchant')
    vi.stubEnv('ECONT_PASSWORD', 'secret')
    vi.stubEnv('ECONT_SENDER_OFFICE_CODE', '1120')

    // Live prices with hand-written labels is a working shop, and is exactly where
    // this one stood before booking was built.
    expect(canQuoteLiveRates('econt')).toBe(true)
    expect(canBookWaybills('econt')).toBe(false)
    expect(missingWaybillRequirements()).toEqual(['ECONT_SENDER_PHONE'])

    vi.stubEnv('ECONT_SENDER_PHONE', '+359888123456')

    expect(canBookWaybills('econt')).toBe(true)
    expect(missingWaybillRequirements()).toEqual([])
  })

  it('reports the pricing gaps too, so the checklist is one list', () => {
    vi.stubEnv('ECONT_SENDER_OFFICE_CODE', '1120')

    expect(missingWaybillRequirements()).toEqual([
      'ECONT_USERNAME',
      'ECONT_PASSWORD',
      'ECONT_SENDER_PHONE',
    ])
  })

  it('is false for Speedy, whose labels are still made by hand', () => {
    vi.stubEnv('SPEEDY_USERNAME', 'merchant')
    vi.stubEnv('SPEEDY_PASSWORD', 'secret')
    vi.stubEnv('ECONT_SENDER_OFFICE_CODE', '1120')
    vi.stubEnv('ECONT_SENDER_PHONE', '+359888123456')

    expect(canBookWaybills('speedy')).toBe(false)
  })
})

describe('the Speedy stub, asked to book', () => {
  it('answers unconfigured rather than booking nothing and reporting success', async () => {
    expect(
      await courierClient('speedy').createWaybill({
        method: 'office',
        officeId: '1012',
        weightGrams: 550,
        codAmount: null,
        recipient: { name: 'Мария Иванова', phone: '+359887115957' },
        orderNumber: '55C-2026-000123',
      })
    ).toEqual({ status: 'unconfigured', courier: 'speedy' })
  })
})
