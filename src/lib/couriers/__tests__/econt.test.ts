import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createEcontClient } from '../econt'
import type { CourierClient } from '../types'

/**
 * Econt client (AUDIT.md Q-22, B-13).
 *
 * `fetch` is stubbed, so these are tests of the *projection and the failure
 * policy* — the two things that decide whether a customer is offered a real
 * place to collect from. The response fixtures are trimmed copies of live demo
 * responses, field names and all, so a rename upstream shows up here.
 */

const CONFIG = { baseUrl: 'https://demo.example/services' }

/** Shape of one office as Econt actually sends it. */
function rawOffice(overrides: Record<string, unknown> = {}) {
  return {
    id: 37386,
    code: '1012',
    isMPS: false,
    isAPS: false,
    name: 'София Гладстон',
    nameEn: 'Sofia Gladstone',
    address: {
      // Live data really does have the leading space.
      fullAddress: ' София ул. Цар Самуил №3',
      fullAddressEn: ' Sofia ul. Tsar Samuil №3',
      city: { id: 41, name: 'София', nameEn: 'Sofia', postCode: '1000' },
    },
    // 09:00 and 18:00 Europe/Sofia.
    normalBusinessHoursFrom: 1789538400000,
    normalBusinessHoursTo: 1789570800000,
    shipmentTypes: ['post', 'courier'],
    ...overrides,
  }
}

let fetchMock: ReturnType<typeof vi.fn>

/**
 * Answer every request with one payload.
 *
 * A fresh `Response` per call: a body can only be read once, so reusing one
 * instance would make the second fetch of any test fail for the wrong reason.
 */
function respondWith(offices: unknown[]) {
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ offices }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
  )
}

function client(): CourierClient {
  return createEcontClient(CONFIG)
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the request Econt receives', () => {
  it('posts to the nomenclature endpoint', async () => {
    respondWith([rawOffice()])

    await client().searchCities('София')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]

    expect(url).toBe(
      'https://demo.example/services/Nomenclatures/NomenclaturesService.getOffices.json'
    )
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ countryCode: 'BGR' })
  })

  it('sends no credentials, because the nomenclature is public', async () => {
    // Not an omission. The endpoint validates credentials when they are present,
    // so a typo in ECONT_PASSWORD would turn a working public 200 into a 517 and
    // take the office picker down with it. Verified: the demo credentials are
    // themselves rejected by the production host.
    respondWith([rawOffice()])

    await client().searchCities('София')

    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
  })

  it('never asks for the city nomenclature', async () => {
    // getCities is 18 MB because every city embeds its serving-office table.
    // Everything the picker needs is on the office records already.
    respondWith([rawOffice()])

    await client().officesIn('41', 'office')

    expect(fetchMock.mock.calls[0][0]).not.toContain('getCities')
  })
})

describe('projecting an office', () => {
  it('uses the office code as the id, not the internal primary key', async () => {
    // `receiverOfficeCode` on the waybill is the code. Storing `id` produces an
    // order that looks fine until the label is rejected.
    respondWith([rawOffice({ id: 37386, code: '1012' })])

    const result = await client().findOffice('1012')

    expect(result).toMatchObject({ status: 'ok', data: { id: '1012' } })
  })

  it('carries the city and post code from the courier record', async () => {
    respondWith([rawOffice()])

    const result = await client().findOffice('1012')

    expect(result.status).toBe('ok')
    expect(result.status === 'ok' && result.data).toMatchObject({
      courier: 'econt',
      kind: 'office',
      name: 'София Гладстон',
      address: 'София ул. Цар Самуил №3',
      cityId: '41',
      cityName: 'София',
      postCode: '1000',
    })
  })

  it('trims the leading space Econt puts in fullAddress', async () => {
    respondWith([rawOffice()])

    const result = await client().findOffice('1012')

    expect(result.status === 'ok' && result.data?.address.startsWith(' ')).toBe(false)
  })

  it('classifies an Еконтомат as a locker', async () => {
    respondWith([rawOffice({ code: '1702', isAPS: true, name: 'Еконтомат Русе' })])

    const result = await client().findOffice('1702')

    expect(result.status === 'ok' && result.data?.kind).toBe('locker')
  })

  it('formats opening hours on the Sofia clock, not the server clock', async () => {
    // The timestamps encode a time of day; production runs in UTC, so reading
    // them without a fixed zone renders every office hours early.
    respondWith([rawOffice()])

    const result = await client().findOffice('1012')

    expect(result.status === 'ok' && result.data?.hours).toBe('09:00–18:00')
  })

  it('omits hours rather than inventing them', async () => {
    // A wrong closing time sends someone to a shut office.
    respondWith([
      rawOffice({ normalBusinessHoursFrom: undefined, normalBusinessHoursTo: undefined }),
    ])

    const result = await client().findOffice('1012')

    expect(result.status === 'ok' && result.data?.hours).toBeUndefined()
  })
})

describe('dropping offices a parcel cannot be sent to', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['no code, so nothing to put on the waybill', { code: undefined }],
    ['no name to show the customer', { name: undefined }],
    [
      'no post code, so it cannot be matched to an address',
      { address: { fullAddress: 'x', city: { id: 41, name: 'София' } } },
    ],
    ['a mobile station, which is a van on a route', { isMPS: true }],
    ['a cargo-only depot', { shipmentTypes: ['cargo', 'pallet'] }],
  ]

  for (const [reason, override] of cases) {
    it(`drops an office with ${reason}`, async () => {
      // Two offices so the list is not empty, which is its own failure.
      respondWith([rawOffice(override), rawOffice({ code: 'KEEP' })])

      const result = await client().officesIn('41', 'office')

      expect(result.status === 'ok' && result.data.map((office) => office.id)).toEqual([
        'KEEP',
      ])
    })
  }

  it('keeps an office when shipmentTypes is absent entirely', async () => {
    // If Econt stops sending the field, hiding every office would be worse than
    // showing a few that turn out to be cargo-only.
    respondWith([rawOffice({ shipmentTypes: undefined })])

    const result = await client().officesIn('41', 'office')

    expect(result.status === 'ok' && result.data).toHaveLength(1)
  })
})

describe('searching cities', () => {
  const OFFICES = [
    rawOffice({ code: '1012' }),
    // Same city, so the city list must dedupe.
    rawOffice({ code: '1107', name: 'София Аксаков' }),
    rawOffice({
      code: '7001',
      name: 'Русе Централен',
      address: {
        fullAddress: ' Русе бул. Тутракан №8',
        city: { id: 35, name: 'Русе', nameEn: 'Ruse', postCode: '7000' },
      },
    }),
  ]

  it('derives cities from the office list, one entry per city', async () => {
    respondWith(OFFICES)

    const result = await client().searchCities('с')
    expect(result.status === 'ok' && result.data).toEqual([])

    const found = await client().searchCities('со')

    expect(found.status === 'ok' && found.data).toEqual([
      { id: '41', name: 'София', nameEn: 'Sofia', postCode: '1000' },
    ])
  })

  it('does not call the courier for a one-character query', async () => {
    // One letter matches most of the country, so it is not a search.
    respondWith(OFFICES)

    await client().searchCities('с')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('matches on a post code prefix, and on the Latin name', async () => {
    respondWith(OFFICES)
    const econt = client()

    const byPostCode = await econt.searchCities('70')
    expect(byPostCode.status === 'ok' && byPostCode.data[0].name).toBe('Русе')

    // An English-locale customer types "Ruse". Matching only the Cyrillic name
    // means they search, find nothing, and conclude there is no office.
    const byLatin = await econt.searchCities('ruse')
    expect(byLatin.status === 'ok' && byLatin.data[0].name).toBe('Русе')
  })

  it('sorts Cyrillic alphabetically, not by code point', async () => {
    // `localeCompare` under the default locale is nearly right for Cyrillic,
    // which is how this goes unnoticed.
    respondWith([
      rawOffice({
        code: 'Я',
        address: {
          fullAddress: 'x',
          city: { id: 1, name: 'Ямбол', postCode: '8600' },
        },
      }),
      rawOffice({
        code: 'А',
        address: {
          fullAddress: 'x',
          city: { id: 2, name: 'Айтос', postCode: '8601' },
        },
      }),
    ])

    // Matched on the shared post-code prefix, so the order is the sort's doing
    // and not the order the courier happened to send.
    const result = await client().searchCities('860')

    expect(result.status === 'ok' && result.data.map((city) => city.name)).toEqual([
      'Айтос',
      'Ямбол',
    ])
  })
})

describe('listing offices in a city', () => {
  it('filters by city and by kind', async () => {
    respondWith([
      rawOffice({ code: 'OFFICE-SOFIA' }),
      rawOffice({ code: 'LOCKER-SOFIA', isAPS: true }),
      rawOffice({
        code: 'OFFICE-RUSE',
        address: {
          fullAddress: 'x',
          city: { id: 35, name: 'Русе', postCode: '7000' },
        },
      }),
    ])
    const econt = client()

    const offices = await econt.officesIn('41', 'office')
    expect(offices.status === 'ok' && offices.data.map((o) => o.id)).toEqual([
      'OFFICE-SOFIA',
    ])

    const lockers = await econt.officesIn('41', 'locker')
    expect(lockers.status === 'ok' && lockers.data.map((o) => o.id)).toEqual([
      'LOCKER-SOFIA',
    ])
  })

  it('reports an empty list for a city with no locker, rather than failing', async () => {
    // Plenty of settlements have an office and no Еконтомат. That is data, not
    // an error, and the picker says so.
    respondWith([rawOffice()])

    const result = await client().officesIn('41', 'locker')

    expect(result).toEqual({ status: 'ok', data: [] })
  })
})

describe('verifying a submitted office', () => {
  it('answers null for a code the courier does not know', async () => {
    // Distinct from a failed lookup: null means we looked and it is not there,
    // which is what lets the checkout reject a closed office.
    respondWith([rawOffice({ code: '1012' })])

    const result = await client().findOffice('9999')

    expect(result).toEqual({ status: 'ok', data: null })
  })
})

describe('caching', () => {
  it('downloads the nomenclature once and reuses it', async () => {
    respondWith([rawOffice()])
    const econt = client()

    await econt.searchCities('со')
    await econt.officesIn('41', 'office')
    await econt.findOffice('1012')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('collapses concurrent lookups into one download', async () => {
    // 1.7 MB per call, so a page resolving a city list and an office list at
    // once must not pay twice.
    respondWith([rawOffice()])
    const econt = client()

    await Promise.all([
      econt.searchCities('со'),
      econt.officesIn('41', 'office'),
      econt.findOffice('1012'),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 400 }))
    const econt = client()

    const failed = await econt.findOffice('1012')
    expect(failed.status).toBe('failed')

    respondWith([rawOffice()])
    const second = await econt.findOffice('1012')

    expect(second.status).toBe('ok')
  })
})

describe('failure', () => {
  it('reports a lookup failure instead of throwing', async () => {
    // An exception here would be a 500 on a checkout that could have degraded to
    // a text field.
    fetchMock.mockRejectedValue(new Error('ECONNRESET'))

    const result = await client().officesIn('41', 'office')

    expect(result).toMatchObject({ status: 'failed', courier: 'econt' })
  })

  it('treats a 200 with no usable offices as a failure, not an empty country', async () => {
    // `ok: []` would render an empty picker with no explanation.
    respondWith([])

    const result = await client().searchCities('со')

    expect(result).toMatchObject({ status: 'failed', courier: 'econt' })
  })

  it('does not retry a 4xx', async () => {
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }))

    const result = await client().findOffice('1012')

    expect(result).toMatchObject({ status: 'failed' })
    // Re-sending a rejected request only doubles the customer's wait.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a 5xx and succeeds on a later attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ offices: [rawOffice()] }), { status: 200 })
      )

    const result = await client().findOffice('1012')

    expect(result.status).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after a bounded number of attempts', async () => {
    fetchMock.mockResolvedValue(new Response('busy', { status: 500 }))

    const result = await client().findOffice('1012')

    expect(result.status).toBe('failed')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('times out rather than holding a checkout open', async () => {
    // A courier that accepts the connection and never answers would otherwise
    // keep the request alive until the platform kills it.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          )
        })
    )

    vi.useFakeTimers()
    try {
      const pending = client().findOffice('1012')
      // Three attempts, each with its own timeout, plus backoff between them.
      await vi.advanceTimersByTimeAsync(60_000)

      expect(await pending).toMatchObject({ status: 'failed' })
    } finally {
      vi.useRealTimers()
    }
  })
})
