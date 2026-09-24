import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPigeonClient, pigeonTrackingUrl, type PigeonConfig } from '../pigeon'
import type { CourierClient, WaybillRequest } from '../types'
import { eur } from '../../money'

/**
 * Pigeon Express client.
 *
 * `fetch` is stubbed, so these are tests of the *projection, the request bodies
 * and the failure policy*. Unlike Econt's and Speedy's, the fixtures are NOT
 * copies of live answers: they follow the published OpenAPI document, because no
 * key existed when the client was written. When the sandbox is verified, replace
 * them with what it actually sends.
 */

const CONFIG: PigeonConfig = {
  baseUrl: 'https://api.example/v1',
  credentials: () => ({ key: 'pk_test_1', secret: 'sk_test_1' }),
  pickup: () => ({ officeId: 7 }),
}

function rawOffice(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    name: 'Пловдив Център',
    code: 'PDV01',
    type: 'office',
    address: 'ул. Иван Вазов 5',
    city: { id: 301, name: 'Пловдив', name_en: 'Plovdiv', postal_code: '4000' },
    postal_code: '4000',
    working_hours: { monday: { open: '09:00:00', close: '18:00:00' }, sunday: null },
    ...overrides,
  }
}

function page(data: unknown[], current = 1, last = 1) {
  return { success: true, data, meta: { current_page: current, last_page: last } }
}

function calculation(total: number) {
  return {
    success: true,
    data: { shipping_price: total, total_service_fees: 0, total_price: total, currency: 'EUR' },
  }
}

const WAYBILL_REQUEST: WaybillRequest = {
  method: 'office',
  officeId: '12',
  weightGrams: 550,
  codAmount: eur(19.99),
  recipient: { name: 'Мария Иванова', phone: '+359887115957', email: 'maria@example.com' },
  orderNumber: '55C-2026-000123',
}

let fetchMock: ReturnType<typeof vi.fn>

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Answer every request with one payload, a fresh `Response` each time. */
function respondWith(payload: unknown, status = 200) {
  fetchMock.mockImplementation(async () => json(payload, status))
}

function client(overrides: Partial<PigeonConfig> = {}): CourierClient {
  return createPigeonClient({ ...CONFIG, ...overrides })
}

function urlOf(call = 0): URL {
  return new URL(fetchMock.mock.calls[call][0])
}

function sentBody(call = 0): Record<string, any> {
  return JSON.parse(fetchMock.mock.calls[call][1].body)
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the request Pigeon receives', () => {
  it('sends the key pair in headers and asks for offices with GET', async () => {
    respondWith(page([rawOffice()]))

    await client().searchCities('Пловдив')

    const [, init] = fetchMock.mock.calls[0]
    expect(urlOf().pathname).toBe('/v1/offices')
    expect(urlOf().searchParams.get('per_page')).toBe('100')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect(init.headers).toMatchObject({
      'X-API-Key': 'pk_test_1',
      'X-API-Secret': 'sk_test_1',
      'X-Platform': '55candles',
    })
  })

  it('reads every page of the office list, once', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const n = Number(new URL(url).searchParams.get('page'))
      return json(page([rawOffice({ id: n, name: `Офис ${n}` })], n, 3))
    })

    const pigeon = client()
    await pigeon.officesIn('301', 'office')
    const offices = await pigeon.officesIn('301', 'office')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(offices.status === 'ok' && offices.data.map((office) => office.id)).toEqual([
      '1',
      '2',
      '3',
    ])
  })
})

describe('the office list', () => {
  it('projects offices and lockers, and drops what no parcel can be sent to', async () => {
    respondWith(
      page([
        rawOffice(),
        rawOffice({
          id: 13,
          name: 'Автомат Мол',
          type: 'locker',
          working_hours: [
            { day: 'monday', open: '00:00', close: '23:59', is_closed: false },
          ],
        }),
        rawOffice({ id: 14, type: 'warehouse' }),
        rawOffice({ id: 15, city: undefined }),
      ])
    )

    const pigeon = client()
    const offices = await pigeon.officesIn('301', 'office')
    const lockers = await pigeon.officesIn('301', 'locker')

    expect(offices).toEqual({
      status: 'ok',
      data: [
        {
          id: '12',
          courier: 'pigeon',
          kind: 'office',
          name: 'Пловдив Център',
          address: 'ул. Иван Вазов 5',
          cityId: '301',
          cityName: 'Пловдив',
          cityNameEn: 'Plovdiv',
          postCode: '4000',
          hours: '09:00–18:00',
        },
      ],
    })
    expect(lockers.status === 'ok' && lockers.data.map((office) => [office.id, office.hours])).toEqual([
      ['13', '00:00–23:59'],
    ])
    expect(await pigeon.findOffice('14')).toEqual({ status: 'ok', data: null })
  })

  it('derives the cities from the offices', async () => {
    respondWith(
      page([
        rawOffice(),
        rawOffice({ id: 20, city: { id: 100, name: 'Варна', postal_code: '9000' }, postal_code: '9000' }),
      ])
    )

    expect(await client().searchCities('пло')).toEqual({
      status: 'ok',
      data: [{ id: '301', name: 'Пловдив', nameEn: 'Plovdiv', postCode: '4000' }],
    })
  })

  it('fails an empty list rather than showing the picker with nothing in it', async () => {
    respondWith(page([]))

    expect((await client().searchCities('Пловдив')).status).toBe('failed')
  })

  it('treats success:false as a failure even inside a 200', async () => {
    respondWith({ success: false, message: 'Invalid API key' })

    expect(await client().searchCities('Пловдив')).toEqual({
      status: 'failed',
      courier: 'pigeon',
      reason: 'Invalid API key',
    })
  })
})

describe('when Pigeon is not configured', () => {
  it('answers unconfigured without keys, and calls nothing', async () => {
    const pigeon = client({ credentials: () => null })

    expect(await pigeon.searchCities('Пловдив')).toEqual({
      status: 'unconfigured',
      courier: 'pigeon',
    })
    expect(await pigeon.trackShipments(['PX1'])).toEqual({
      status: 'unconfigured',
      courier: 'pigeon',
    })
    expect(await pigeon.labelPdf!('PX1')).toEqual({ status: 'unconfigured', courier: 'pigeon' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers unconfigured for a price or a waybill with no pickup point', async () => {
    const pigeon = client({ pickup: () => null })

    expect(
      (await pigeon.priceShipment({ method: 'office', officeId: '12', weightGrams: 500, codAmount: null }))
        .status
    ).toBe('unconfigured')
    expect((await pigeon.createWaybill(WAYBILL_REQUEST)).status).toBe('unconfigured')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('pricing', () => {
  it('prices a prepaid parcel once, with no COD fee', async () => {
    respondWith(calculation(4.5))

    const result = await client().priceShipment({
      method: 'office',
      officeId: '12',
      weightGrams: 550,
      codAmount: null,
    })

    expect(result).toEqual({
      status: 'ok',
      data: { delivery: eur(4.5), codFee: eur(0), total: eur(4.5) },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentBody()).toEqual({
      pickup_type: 'office',
      pickup_office_id: 7,
      delivery_type: 'office',
      delivery_office_id: 12,
      packages: [{ weight: 0.55 }],
      service_type: 'standard',
      who_pays: 'sender',
    })
  })

  it('splits the COD fee off by pricing with and without it', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      return json(calculation(body.service_codes ? 5.3 : 4.5))
    })

    const result = await client().priceShipment({
      method: 'locker',
      officeId: '13',
      weightGrams: 20,
      codAmount: eur(19.99),
    })

    expect(result).toEqual({
      status: 'ok',
      data: { delivery: eur(4.5), codFee: eur(0.8), total: eur(5.3) },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const bodies = [sentBody(0), sentBody(1)]
    expect(bodies.find((body) => body.service_codes)).toMatchObject({
      delivery_type: 'locker',
      packages: [{ weight: 0.1 }],
      service_codes: { cod_amount: 19.99 },
    })
  })

  it('fails a price that is not in euro', async () => {
    respondWith({ success: true, data: { total_price: 9, currency: 'BGN' } })

    const result = await client().priceShipment({
      method: 'office',
      officeId: '12',
      weightGrams: 500,
      codAmount: null,
    })

    expect(result.status).toBe('failed')
  })

  it('sends a collection pickup as a city and an address', async () => {
    respondWith(calculation(6))

    await client({ pickup: () => ({ cityId: 68134, address: 'ул. Шипка 1' }) }).priceShipment({
      method: 'office',
      officeId: '12',
      weightGrams: 500,
      codAmount: null,
    })

    expect(sentBody()).toMatchObject({
      pickup_type: 'address',
      pickup_address: { city_id: 68134, additional_info: 'ул. Шипка 1' },
    })
  })
})

describe('door delivery', () => {
  const DOOR = {
    method: 'door' as const,
    address: { city: 'гр. Пловдив', postCode: '4000', street: 'ул. Гладстон 10' },
    weightGrams: 500,
    codAmount: null,
  }

  it("looks the settlement up in Pigeon's cities and remembers it", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      new URL(url).pathname.endsWith('/cities')
        ? json(page([{ id: 301, name: 'Пловдив', postal_code: '4000' }]))
        : json(calculation(5))
    )

    const pigeon = client()
    await pigeon.priceShipment(DOOR)
    await pigeon.priceShipment(DOOR)

    expect(urlOf(0).searchParams.get('name')).toBe('Пловдив')
    expect(urlOf(0).searchParams.get('postal_code')).toBe('4000')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(sentBody(1)).toMatchObject({
      delivery_type: 'address',
      delivery_address: { city_id: 301, postal_code: '4000', additional_info: '---' },
    })
  })

  it('refuses to guess between two settlements with the same name and code', async () => {
    respondWith(
      page([
        { id: 1, name: 'Ново село', postal_code: '4000' },
        { id: 2, name: 'Ново село', postal_code: '4000' },
      ])
    )

    const result = await client().priceShipment({
      ...DOOR,
      address: { ...DOOR.address, city: 'Ново село' },
    })

    expect(result).toMatchObject({ status: 'failed', reason: expect.stringContaining('more than one') })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('will not book a door parcel with a street shorter than Pigeon accepts', async () => {
    respondWith(page([{ id: 301, name: 'Пловдив', postal_code: '4000' }]))

    const result = await client().createWaybill({
      ...WAYBILL_REQUEST,
      method: 'door',
      officeId: undefined,
      address: { ...DOOR.address, street: '5' },
    })

    expect(result.status).toBe('failed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('booking a waybill', () => {
  it('sends the recipient, the COD and our order number, and returns the number', async () => {
    respondWith({ success: true, data: { reference_number: 'PX100200', status: 'created' } })

    const result = await client().createWaybill(WAYBILL_REQUEST)

    expect(result).toEqual({
      status: 'ok',
      data: { number: 'PX100200', trackingUrl: pigeonTrackingUrl('PX100200') },
    })
    expect(urlOf().pathname).toBe('/v1/shipments')
    expect(sentBody()).toEqual({
      receiver_name: 'Мария Иванова',
      receiver_phone: '359887115957',
      receiver_email: 'maria@example.com',
      pickup_type: 'office',
      pickup_office_id: 7,
      delivery_type: 'office',
      delivery_office_id: 12,
      packages: [{ weight: 0.55 }],
      inventory_items: [{ description: 'Ароматни свещи', quantity: 1 }],
      service_type: 'standard',
      who_pays: 'sender',
      service_codes: { cod_amount: 19.99 },
      external_reference: '55C-2026-000123',
    })
  })

  it('writes a domestic phone in the international form', async () => {
    respondWith({ success: true, data: { reference_number: 'PX1' } })

    await client().createWaybill({
      ...WAYBILL_REQUEST,
      recipient: { name: 'Иван', phone: '0887 115 957' },
    })

    expect(sentBody().receiver_phone).toBe('359887115957')
    expect(sentBody().receiver_email).toBeUndefined()
  })

  it('never retries a booking, because a retry can be a second parcel', async () => {
    respondWith({ message: 'Server Error' }, 503)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await client().createWaybill(WAYBILL_REQUEST)

    expect(result.status).toBe('failed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports validation errors by field', async () => {
    respondWith(
      { success: false, message: 'Validation failed', errors: { receiver_phone: ['Invalid phone'] } },
      422
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await client().createWaybill(WAYBILL_REQUEST)

    expect(result.status).toBe('failed')
  })

  it('fails loudly on an accepted request with no reference number', async () => {
    respondWith({ success: true, data: { status: 'created' } })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await client().createWaybill(WAYBILL_REQUEST)

    expect(result.status).toBe('failed')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('55C-2026-000123'))
  })
})

describe('tracking', () => {
  function route(tracking: unknown, payouts: unknown = { success: true, data: { rows: [] } }) {
    fetchMock.mockImplementation(async (url: string) =>
      new URL(url).pathname.endsWith('/payments/completed') ? json(payouts) : json(tracking)
    )
  }

  it('reports found and missing parcels, newest event first', async () => {
    route({
      success: true,
      data: {
        PX1: {
          found: true,
          status: 'Доставена',
          delivery_date: '2026-09-23T14:05:00+03:00',
          expected_delivery_date: '2026-09-23T00:00:00+03:00',
          tracking: [
            { status: 'Приета', created_at: '2026-09-22T10:00:00+03:00' },
            { status: 'Доставена', note: 'лично', created_at: '2026-09-23T14:05:00+03:00' },
          ],
          chain_after: [{ reference_number: 'PX9' }],
        },
        PX2: { found: false, error: 'Shipment not found' },
      },
    })

    const result = await client().trackShipments(['PX1', 'PX2', 'PX1'])

    expect(result).toEqual({
      status: 'ok',
      data: {
        found: [
          {
            number: 'PX1',
            status: 'Доставена',
            events: [
              { at: '2026-09-23T11:05:00.000Z', text: 'Доставена — лично' },
              { at: '2026-09-22T07:00:00.000Z', text: 'Приета' },
            ],
            deliveredAt: '2026-09-23T11:05:00.000Z',
            expectedDeliveryDate: '2026-09-23',
            followedBy: 'PX9',
          },
        ],
        missing: [{ number: 'PX2', reason: 'Shipment not found' }],
      },
    })

    const bulk = fetchMock.mock.calls.findIndex(([url]) =>
      String(url).endsWith('/shipments/track/bulk')
    )
    expect(sentBody(bulk)).toEqual({ references: ['PX1', 'PX2'] })
  })

  it('says when the COD money was collected and paid out', async () => {
    route(
      { success: true, data: { PX1: { found: true, status: 'Доставена', tracking: [] } } },
      {
        success: true,
        data: {
          rows: [
            { waybill: 'PX1', collected_date: '23-09-2026', paid_date: '24-09-2026', amount_eur: '19.99' },
          ],
        },
      }
    )

    const result = await client().trackShipments(['PX1'])

    expect(result.status === 'ok' && result.data.found[0]).toMatchObject({
      codCollected: { amount: eur(19.99), at: '2026-09-23T09:00:00.000Z' },
      codPaid: { amount: eur(19.99), at: '2026-09-24T09:00:00.000Z' },
    })
  })

  it('still tracks when the payout report fails', async () => {
    route(
      { success: true, data: { PX1: { found: true, status: 'В движение', tracking: [] } } },
      { success: false, message: 'Range too long' }
    )

    const result = await client().trackShipments(['PX1'])

    expect(result.status === 'ok' && result.data.found[0]).toEqual({
      number: 'PX1',
      status: 'В движение',
      events: [],
    })
  })

  it('asks in batches of at most 100', async () => {
    route({ success: true, data: {} })

    const numbers = Array.from({ length: 150 }, (_, i) => `PX${i}`)
    const result = await client().trackShipments(numbers)

    const batches = fetchMock.mock.calls
      .map(([url, init], i) => (String(url).endsWith('/track/bulk') ? sentBody(i) : null))
      .filter(Boolean)
      .map((body) => body!.references.length)

    expect(batches.sort((a, b) => b - a)).toEqual([100, 50])
    expect(result.status === 'ok' && result.data.missing).toHaveLength(150)
  })
})

describe('the label', () => {
  it('fetches the A4 PDF with the key pair', async () => {
    fetchMock.mockImplementation(async () => new Response('%PDF-1.7 …', { status: 200 }))

    const result = await client().labelPdf!('PX 1')

    expect(result.status).toBe('ok')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.example/v1/shipments/PX%201/label?format=a4')
    expect(init.headers).toMatchObject({ 'X-API-Key': 'pk_test_1', Accept: 'application/pdf' })
  })

  it('refuses bytes that are not a PDF', async () => {
    fetchMock.mockImplementation(async () => json({ success: false, message: 'Not found' }))

    expect((await client().labelPdf!('PX1')).status).toBe('failed')
  })

  it('fails on an HTTP error', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 404 }))

    expect(await client().labelPdf!('PX1')).toEqual({
      status: 'failed',
      courier: 'pigeon',
      reason: 'HTTP 404',
    })
  })
})
