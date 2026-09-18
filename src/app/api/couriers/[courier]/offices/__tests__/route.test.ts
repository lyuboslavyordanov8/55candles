import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GET } from '../route'
import { courierClient } from '@/lib/couriers'
import type { CourierCity, CourierClient, CourierOffice, LookupResult } from '@/lib/couriers/types'

/**
 * Courier lookup route (AUDIT.md Q-22, B-13).
 *
 * The courier client is mocked: what this endpoint is responsible for is
 * *translating* a `LookupResult` into a status code the picker can act on, and
 * refusing a request it cannot make sense of. Whether Econt answers correctly is
 * `couriers/__tests__/econt.test.ts`.
 */

vi.mock('@/lib/couriers', () => ({
  courierClient: vi.fn(),
}))

const SOFIA: CourierCity = { id: '41', name: 'София', postCode: '1000' }

const OFFICE: CourierOffice = {
  id: '1012',
  courier: 'econt',
  kind: 'office',
  name: 'София Гладстон',
  address: 'София ул. Цар Самуил №3',
  cityId: '41',
  cityName: 'София',
  postCode: '1000',
  hours: '09:00–18:00',
}

/** A client whose three methods all return the same prepared result. */
function clientReturning(result: LookupResult<never>): CourierClient {
  const answer = () => Promise.resolve(result as never)

  return {
    courier: 'econt',
    searchCities: answer,
    officesIn: answer,
    findOffice: answer,
  }
}

function stubClient(client: Partial<CourierClient>) {
  vi.mocked(courierClient).mockReturnValue({
    courier: 'econt',
    searchCities: () => Promise.resolve({ status: 'unconfigured', courier: 'econt' }),
    officesIn: () => Promise.resolve({ status: 'unconfigured', courier: 'econt' }),
    findOffice: () => Promise.resolve({ status: 'unconfigured', courier: 'econt' }),
    ...client,
  })
}

function get(courier: string, query: string) {
  return GET(new Request(`http://localhost/api/couriers/${courier}/offices?${query}`), {
    params: Promise.resolve({ courier }),
  })
}

beforeEach(() => {
  // The route logs courier outages; assert on that where it matters, not in
  // every test's output.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('city search', () => {
  it('returns the cities the courier knows', async () => {
    stubClient({ searchCities: () => Promise.resolve({ status: 'ok', data: [SOFIA] }) })

    const response = await get('econt', 'city=Соф')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ cities: [SOFIA] })
  })

  it('passes the query through untouched', async () => {
    // Including Cyrillic, which has to survive URL decoding to match anything.
    const searchCities = vi.fn(async () => ({ status: 'ok' as const, data: [] }))
    stubClient({ searchCities })

    await get('econt', `city=${encodeURIComponent('Велико Търново')}`)

    expect(searchCities).toHaveBeenCalledWith('Велико Търново')
  })

  it('returns 200 with an empty list when no city matches', async () => {
    // Not an error. The picker says so in words, and offers the post code.
    stubClient({ searchCities: () => Promise.resolve({ status: 'ok', data: [] }) })

    const response = await get('econt', 'city=zzz')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ cities: [] })
  })

  it('accepts an empty query rather than calling it malformed', async () => {
    // The picker clears the box; the client decides a short query matches
    // nothing. A 400 here would surface as an error toast on a backspace.
    const searchCities = vi.fn(async () => ({ status: 'ok' as const, data: [] }))
    stubClient({ searchCities })

    const response = await get('econt', 'city=')

    expect(response.status).toBe(200)
    expect(searchCities).toHaveBeenCalledWith('')
  })

  it('rejects an absurdly long query without asking the courier', async () => {
    const searchCities = vi.fn(async () => ({ status: 'ok' as const, data: [] }))
    stubClient({ searchCities })

    const response = await get('econt', `city=${'а'.repeat(101)}`)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'queryTooLong' })
    expect(searchCities).not.toHaveBeenCalled()
  })
})

describe('office listing', () => {
  it('returns the offices in a city', async () => {
    stubClient({ officesIn: () => Promise.resolve({ status: 'ok', data: [OFFICE] }) })

    const response = await get('econt', 'cityId=41&kind=office')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ offices: [OFFICE] })
  })

  it('forwards the requested kind', async () => {
    const officesIn = vi.fn(async () => ({ status: 'ok' as const, data: [] }))
    stubClient({ officesIn })

    await get('econt', 'cityId=41&kind=locker')

    expect(officesIn).toHaveBeenCalledWith('41', 'locker')
  })

  it('rejects a kind that is not a collection point', async () => {
    // `kind` reaches a filter, so an unvalidated value would return an empty
    // list that reads as "no offices here" rather than as a bug.
    const officesIn = vi.fn(async () => ({ status: 'ok' as const, data: [] }))
    stubClient({ officesIn })

    const response = await get('econt', 'cityId=41&kind=warehouse')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'badQuery' })
    expect(officesIn).not.toHaveBeenCalled()
  })

  it('rejects a request with a kind but no city', async () => {
    stubClient({})

    const response = await get('econt', 'kind=office')

    expect(response.status).toBe(400)
  })

  it('rejects a request with neither query shape', async () => {
    stubClient({})

    const response = await get('econt', '')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'badQuery' })
  })

  it('prefers the city search when both shapes are supplied', async () => {
    // Ambiguous input, so it resolves one way on purpose rather than by the
    // accident of which check came first.
    const searchCities = vi.fn(async () => ({ status: 'ok' as const, data: [SOFIA] }))
    const officesIn = vi.fn(async () => ({ status: 'ok' as const, data: [] }))
    stubClient({ searchCities, officesIn })

    await get('econt', 'city=Соф&cityId=41&kind=office')

    expect(searchCities).toHaveBeenCalled()
    expect(officesIn).not.toHaveBeenCalled()
  })
})

describe('reporting a courier that cannot answer', () => {
  it('returns 503 for a courier with no credentials', async () => {
    // Distinct from 502 on purpose: the picker treats this as permanent and
    // falls back to a text field instead of offering a pointless retry.
    vi.mocked(courierClient).mockReturnValue(
      clientReturning({ status: 'unconfigured', courier: 'speedy' } as LookupResult<never>)
    )

    const response = await get('speedy', 'city=Соф')

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'unconfigured',
      courier: 'speedy',
    })
  })

  it('returns 502 when the lookup failed, and logs it', async () => {
    vi.mocked(courierClient).mockReturnValue(
      clientReturning({
        status: 'failed',
        courier: 'econt',
        reason: 'timed out after 8000ms',
      } as LookupResult<never>)
    )

    const response = await get('econt', 'cityId=41&kind=office')

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: 'failed', courier: 'econt' })
    // A courier outage mid-checkout is an operational event; the customer only
    // ever sees a text field, so the log is the only trace.
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('timed out after 8000ms')
    )
  })

  it('reports an outage the same way for both query shapes', async () => {
    vi.mocked(courierClient).mockReturnValue(
      clientReturning({
        status: 'failed',
        courier: 'econt',
        reason: 'HTTP 500',
      } as LookupResult<never>)
    )

    const cities = await get('econt', 'city=Соф')
    const offices = await get('econt', 'cityId=41&kind=office')

    expect(cities.status).toBe(502)
    expect(offices.status).toBe(502)
  })
})

describe('an unknown courier', () => {
  it('is a 404, not a 500', async () => {
    const response = await get('dhl', 'city=Соф')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'unknownCourier' })
  })

  it('is rejected before any client is constructed', async () => {
    // `courierClient` would throw on an unknown key; the guard is what makes
    // this a clean 404.
    await get('../../etc/passwd', 'city=Соф')

    expect(courierClient).not.toHaveBeenCalled()
  })
})
