import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createSpeedyClient, speedyTrackingUrl, type SpeedyConfig } from '../speedy'
import type { CourierClient, WaybillRequest } from '../types'
import { eur, type Money } from '../../money'

/**
 * Speedy client (AUDIT.md Q-22, Phase 4).
 *
 * `fetch` is stubbed, so these are tests of the *projection, the request bodies
 * and the failure policy*. The fixtures are trimmed copies of what the live
 * service answered on 2026-09-21 — field names, spellings and all — so a rename
 * upstream shows up here.
 *
 * Three of Speedy's habits get more attention than the rest, because each one is
 * silently expensive to get wrong:
 *
 * - an application error arrives as **HTTP 200** with an `error` object;
 * - a **private recipient must not have a `contactName`**;
 * - free-text street goes in **`addressNote`**, and `addressLine1` is rejected.
 */

const CONFIG: SpeedyConfig = {
  baseUrl: 'https://api.example/v1',
  credentials: () => ({ username: '1996702', password: 'secret' }),
  sender: () => ({ clientId: 88888888888000, dropoffOfficeId: 1 }),
}

/** Shape of one office as Speedy actually sends it. */
function rawOffice(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'ПЛОВДИВ – СКЛАД ЮГ',
    nameEn: 'PLOVDIV - WAREHOUSE SOUTH',
    siteId: 56784,
    address: {
      countryId: 100,
      siteId: 56784,
      siteType: 'ГР.',
      siteName: 'ПЛОВДИВ',
      postCode: '4000',
      fullAddressString: 'гр. ПЛОВДИВ ул. КУКЛЕНСКО ШОСЕ No 15',
      localAddressString: 'ул. КУКЛЕНСКО ШОСЕ No 15',
    },
    workingTimeFrom: '08:30',
    workingTimeTo: '19:30',
    type: 'OFFICE',
    cargoTypesAllowed: ['PARCEL'],
    pickUpAllowed: true,
    dropOffAllowed: true,
    validFrom: '2000-01-01',
    validTo: '3000-01-01',
    ...overrides,
  }
}

/** A locker, which Speedy calls an automated parcel terminal. */
function rawLocker(overrides: Record<string, unknown> = {}) {
  return rawOffice({
    id: 9016,
    name: 'ПЛОВДИВ - ЛЕКСИ ПЕЩЕРСКО ШОСЕ (АВТОМАТ)',
    nameEn: 'PLOVDIV - LEKSI PESHTERSKO SHOSE (LOCKER)',
    type: 'APT',
    workingTimeFrom: '08:00',
    workingTimeTo: '21:30',
    ...overrides,
  })
}

/** One priced service, as `/calculate/` answers it. */
function calculation(overrides: Record<string, unknown> = {}) {
  return {
    serviceId: 505,
    price: {
      amount: 2.04,
      vat: 0.41,
      total: 2.45,
      currency: 'EUR',
      details: {
        netAmount: { amount: 1.27, vatPercent: 0.2 },
        fuelSurcharge: { amount: 0, percent: 0, vatPercent: 0.2 },
        codPremium: { amount: 0.77, percent: 0, vatPercent: 0.2 },
      },
    },
    pickupDate: '2026-09-21',
    deliveryDeadline: '2026-09-22T19:00:00+0300',
    ...overrides,
  }
}

const WAYBILL_REQUEST: WaybillRequest = {
  method: 'office',
  officeId: '9016',
  weightGrams: 550,
  codAmount: eur(19.99),
  recipient: { name: 'Мария Иванова', phone: '+359887115957', email: 'maria@example.com' },
  orderNumber: '55C-2026-000123',
}

let fetchMock: ReturnType<typeof vi.fn>

/**
 * Answer every request with one payload.
 *
 * A fresh `Response` per call: a body can only be read once, so reusing one
 * instance would make the second fetch of any test fail for the wrong reason.
 */
function respondWith(payload: unknown, status = 200) {
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
  )
}

function client(overrides: Partial<SpeedyConfig> = {}): CourierClient {
  return createSpeedyClient({ ...CONFIG, ...overrides })
}

/** The body of the nth request, parsed. */
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

describe('the request Speedy receives', () => {
  it('posts the credentials in the body, because there is no auth header', async () => {
    respondWith({ offices: [rawOffice()] })

    await client().searchCities('Пловдив')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]

    expect(url).toBe('https://api.example/v1/location/office/')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBeUndefined()
    expect(sentBody()).toEqual({
      userName: '1996702',
      password: 'secret',
      language: 'BG',
      countryId: 100,
    })
  })

  it('asks for the whole country once, not per city', async () => {
    respondWith({ offices: [rawOffice()] })

    const speedy = client()
    await speedy.searchCities('Пловдив')
    await speedy.officesIn('56784', 'office')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('makes one download when a page asks for cities and offices at once', async () => {
    respondWith({ offices: [rawOffice()] })

    const speedy = client()
    const [cities, offices] = await Promise.all([
      speedy.searchCities('Пловдив'),
      speedy.officesIn('56784', 'office'),
    ])

    expect(cities.status).toBe('ok')
    expect(offices.status).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('when Speedy is not configured', () => {
  it('answers unconfigured for a lookup rather than calling anonymously', async () => {
    // Unlike Econt's, this nomenclature is not public: an anonymous call would be
    // rejected, so there is nothing to try.
    const speedy = client({ credentials: () => null })

    expect(await speedy.searchCities('Пловдив')).toEqual({
      status: 'unconfigured',
      courier: 'speedy',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers unconfigured for a price with no contract client', async () => {
    const speedy = client({ sender: () => null })

    expect(
      await speedy.priceShipment({
        method: 'office',
        officeId: '9016',
        weightGrams: 550,
        codAmount: null,
      })
    ).toEqual({ status: 'unconfigured', courier: 'speedy' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers unconfigured for a booking with no contract client', async () => {
    const speedy = client({ sender: () => null })

    expect(await speedy.createWaybill(WAYBILL_REQUEST)).toEqual({
      status: 'unconfigured',
      courier: 'speedy',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('an error inside a 200', () => {
  /**
   * The habit that makes this client different from Econt's. Verified: a request
   * with no `serviceIds` answers `200` with
   * `{"error":{"context":"calculation.service.service_ids.required",…}}`. Reading
   * such a body as success would take `price.total` as `undefined` — a free
   * parcel — so every response is checked for `error` before it is read.
   */
  const BODY = {
    error: {
      context: 'calculation.service.service_ids.required',
      message: 'Услуга: Списъкът от куриерски услуги за ценообразуване е празен (EE2026…)',
      id: 'EE2026…',
      code: 400,
    },
    calculations: [],
  }

  it('is a failure for a lookup, with Speedy’s own wording', async () => {
    respondWith(BODY)

    expect(await client().searchCities('Пловдив')).toEqual({
      status: 'failed',
      courier: 'speedy',
      reason: BODY.error.message,
    })
  })

  it('is a failure for a price, not a free parcel', async () => {
    respondWith(BODY)

    const result = await client().priceShipment({
      method: 'office',
      officeId: '9016',
      weightGrams: 550,
      codAmount: eur(19.99),
    })

    expect(result).toEqual({ status: 'failed', courier: 'speedy', reason: BODY.error.message })
  })

  it('falls back to the context when there is no message to show', async () => {
    respondWith({ error: { context: 'calculation.recipient.required' } })

    expect(await client().searchCities('Пловдив')).toEqual({
      status: 'failed',
      courier: 'speedy',
      reason: 'calculation.recipient.required',
    })
  })
})

describe('the office list', () => {
  it('projects a staffed office', async () => {
    respondWith({ offices: [rawOffice()] })

    const result = await client().officesIn('56784', 'office')

    expect(result).toEqual({
      status: 'ok',
      data: [
        {
          id: '1',
          courier: 'speedy',
          kind: 'office',
          name: 'ПЛОВДИВ – СКЛАД ЮГ',
          nameEn: 'PLOVDIV - WAREHOUSE SOUTH',
          address: 'гр. ПЛОВДИВ ул. КУКЛЕНСКО ШОСЕ No 15',
          cityId: '56784',
          cityName: 'ПЛОВДИВ',
          postCode: '4000',
          hours: '08:30–19:30',
        },
      ],
    })
  })

  it('calls an APT a locker, because that is what a customer sees', async () => {
    respondWith({ offices: [rawLocker()] })

    const result = await client().officesIn('56784', 'locker')

    expect(result.status).toBe('ok')
    expect(result.status === 'ok' && result.data.map((office) => office.id)).toEqual(['9016'])
  })

  it('keeps the two kinds apart', async () => {
    respondWith({ offices: [rawOffice(), rawLocker()] })

    const speedy = client()
    const offices = await speedy.officesIn('56784', 'office')
    const lockers = await speedy.officesIn('56784', 'locker')

    expect(offices.status === 'ok' && offices.data).toHaveLength(1)
    expect(lockers.status === 'ok' && lockers.data).toHaveLength(1)
  })

  it('drops a type it does not know, rather than calling it an office', async () => {
    // A partner pickup point is addressed by `pickupGeoPUDOId`, not
    // `pickupOfficeId`, so offering one as an office would produce an order whose
    // waybill Speedy rejects.
    respondWith({ offices: [rawOffice(), rawOffice({ id: 2, type: 'PUDO' })] })

    const result = await client().officesIn('56784', 'office')

    expect(result.status === 'ok' && result.data.map((office) => office.id)).toEqual(['1'])
  })

  it('drops an office a parcel cannot be collected from', async () => {
    respondWith({ offices: [rawOffice({ pickUpAllowed: false })] })

    expect(await client().officesIn('56784', 'office')).toEqual({
      status: 'failed',
      courier: 'speedy',
      reason: 'the office list came back empty',
    })
  })

  it('drops a depot that does not take parcels', async () => {
    respondWith({ offices: [rawOffice({ cargoTypesAllowed: ['PALLET'] })] })

    expect((await client().officesIn('56784', 'office')).status).toBe('failed')
  })

  it('keeps an office whose cargo types Speedy stopped sending', async () => {
    // An allow-list only when present: hiding every office because a field went
    // missing would be worse than showing a few that turn out to be pallet-only.
    const raw = rawOffice()
    delete (raw as Record<string, unknown>).cargoTypesAllowed
    respondWith({ offices: [raw] })

    expect((await client().officesIn('56784', 'office')).status).toBe('ok')
  })

  it('drops an office whose validity has expired', async () => {
    respondWith({ offices: [rawOffice({ validTo: '2020-01-01' }), rawLocker()] })

    const result = await client().officesIn('56784', 'office')

    expect(result.status === 'ok' && result.data).toEqual([])
  })

  it('drops an office that has not opened yet', async () => {
    respondWith({ offices: [rawOffice({ validFrom: '2999-01-01' }), rawLocker()] })

    const result = await client().officesIn('56784', 'office')

    expect(result.status === 'ok' && result.data).toEqual([])
  })

  it('drops a record a parcel cannot be addressed to', async () => {
    // No id means nothing to put on a waybill; no post code means nothing to
    // match against what the customer typed.
    respondWith({
      offices: [
        rawOffice(),
        rawOffice({ id: undefined }),
        rawOffice({ id: 3, address: { ...rawOffice().address, postCode: undefined } }),
        rawOffice({ id: 4, name: '' }),
      ],
    })

    const result = await client().officesIn('56784', 'office')

    expect(result.status === 'ok' && result.data.map((office) => office.id)).toEqual(['1'])
  })

  it('omits hours rather than guessing when Speedy reports none', async () => {
    respondWith({ offices: [rawOffice({ workingTimeFrom: '00:00', workingTimeTo: '00:00' })] })

    const result = await client().officesIn('56784', 'office')

    expect(result.status === 'ok' && result.data[0].hours).toBeUndefined()
  })

  it('reports an empty list as a failure, not as an empty country', async () => {
    respondWith({ offices: [] })

    expect(await client().officesIn('56784', 'office')).toEqual({
      status: 'failed',
      courier: 'speedy',
      reason: 'the office list came back empty',
    })
  })

  it('sorts offices the way Bulgarian is alphabetised', async () => {
    respondWith({
      offices: [
        rawOffice({ id: 10, name: 'Ямбол' }),
        rawOffice({ id: 11, name: 'Асеновград' }),
        rawOffice({ id: 12, name: 'Банско' }),
      ],
    })

    const result = await client().officesIn('56784', 'office')

    expect(result.status === 'ok' && result.data.map((office) => office.name)).toEqual([
      'Асеновград',
      'Банско',
      'Ямбол',
    ])
  })
})

describe('findOffice', () => {
  it('resolves the id we stored', async () => {
    respondWith({ offices: [rawOffice(), rawLocker()] })

    const result = await client().findOffice('9016')

    expect(result.status === 'ok' && result.data?.name).toBe(
      'ПЛОВДИВ - ЛЕКСИ ПЕЩЕРСКО ШОСЕ (АВТОМАТ)'
    )
  })

  it('says "no such office" differently from "we could not look"', async () => {
    respondWith({ offices: [rawOffice()] })

    expect(await client().findOffice('99999')).toEqual({ status: 'ok', data: null })
  })

  it('reports a lookup that failed as failed, not as a missing office', async () => {
    respondWith({ error: { message: 'Невалиден потребител' } })

    expect(await client().findOffice('1')).toEqual({
      status: 'failed',
      courier: 'speedy',
      reason: 'Невалиден потребител',
    })
  })
})

describe('the city list', () => {
  it('is derived from the offices, so every city has somewhere to collect from', async () => {
    respondWith({
      offices: [
        rawOffice(),
        rawLocker(),
        rawOffice({
          id: 20,
          siteId: 21052,
          address: {
            ...rawOffice().address,
            siteId: 21052,
            siteName: 'ДИМИТРОВГРАД',
            postCode: '6400',
          },
        }),
      ],
    })

    const result = await client().searchCities('ди')

    // Two offices in Plovdiv fold into one city, and the list is in Bulgarian
    // alphabetical order rather than Speedy's own.
    expect(result.status === 'ok' && result.data).toEqual([
      { id: '21052', name: 'ДИМИТРОВГРАД', postCode: '6400' },
      { id: '56784', name: 'ПЛОВДИВ', postCode: '4000' },
    ])
  })

  it('matches a city whatever case the customer types', async () => {
    respondWith({ offices: [rawOffice()] })

    const result = await client().searchCities('пловдив')

    expect(result.status === 'ok' && result.data).toHaveLength(1)
  })

  it('matches on the post code as well as the name', async () => {
    respondWith({ offices: [rawOffice()] })

    const result = await client().searchCities('4000')

    expect(result.status === 'ok' && result.data).toHaveLength(1)
  })

  it('sends nothing for a query too short to narrow anything', async () => {
    respondWith({ offices: [rawOffice()] })

    expect(await client().searchCities('П')).toEqual({ status: 'ok', data: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caps the list at something a picker can show', async () => {
    respondWith({
      offices: Array.from({ length: 30 }, (_, index) =>
        rawOffice({
          id: 100 + index,
          siteId: 1000 + index,
          address: {
            ...rawOffice().address,
            siteId: 1000 + index,
            siteName: `ПЛОВДИВ ${index}`,
            postCode: `40${String(index).padStart(2, '0')}`,
          },
        })
      ),
    })

    const result = await client().searchCities('Пловдив')

    expect(result.status === 'ok' && result.data).toHaveLength(20)
  })
})

describe('what a price costs', () => {
  it('asks for one service, from the contract client, with the shop as payer', async () => {
    respondWith({ calculations: [calculation()] })

    await client().priceShipment({
      method: 'office',
      officeId: '9016',
      weightGrams: 550,
      codAmount: eur(19.99),
    })

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example/v1/calculate/')
    expect(sentBody()).toEqual({
      userName: '1996702',
      password: 'secret',
      language: 'BG',
      sender: { clientId: 88888888888000, dropoffOfficeId: 1 },
      recipient: { privatePerson: true, pickupOfficeId: 9016 },
      service: {
        serviceIds: [505],
        autoAdjustPickupDate: true,
        additionalServices: {
          cod: {
            amount: 19.99,
            currencyCode: 'EUR',
            processingType: 'CASH',
            includeShippingPrice: false,
          },
        },
      },
      content: { parcelsCount: 1, totalWeight: 0.55 },
      payment: { courierServicePayer: 'SENDER' },
    })
  })

  it('carries no personal data at all', async () => {
    respondWith({ calculations: [calculation()] })

    await client().priceShipment({
      method: 'door',
      address: { city: 'Пловдив', postCode: '4000', street: 'ул. Иван Вазов 12' },
      weightGrams: 550,
      codAmount: eur(19.99),
    })

    // Not even the street: a price depends on the settlement, and the customer is
    // still deciding. The street appears for the first time on a waybill.
    expect(JSON.stringify(sentBody())).not.toContain('Вазов')
  })

  it('prices a door delivery by settlement and post code', async () => {
    respondWith({ calculations: [calculation()] })

    await client().priceShipment({
      method: 'door',
      address: { city: 'Пловдив', postCode: '4000', street: 'ул. Иван Вазов 12' },
      weightGrams: 550,
      codAmount: null,
    })

    expect(sentBody().recipient).toEqual({
      privatePerson: true,
      addressLocation: { countryId: 100, siteName: 'Пловдив', postCode: '4000' },
    })
    expect(sentBody().service.additionalServices).toBeUndefined()
  })

  it('takes the configured service and payout arrangement', async () => {
    respondWith({ calculations: [calculation({ serviceId: 515 })] })

    await client({
      serviceId: () => 515,
      codProcessing: () => 'POSTAL_MONEY_TRANSFER',
    }).priceShipment({
      method: 'office',
      officeId: '9016',
      weightGrams: 550,
      codAmount: eur(19.99),
    })

    expect(sentBody().service.serviceIds).toEqual([515])
    expect(sentBody().service.additionalServices.cod.processingType).toBe('POSTAL_MONEY_TRANSFER')
  })

  it('omits the drop-off office when parcels are collected instead', async () => {
    respondWith({ calculations: [calculation()] })

    await client({ sender: () => ({ clientId: 123 }) }).priceShipment({
      method: 'office',
      officeId: '9016',
      weightGrams: 550,
      codAmount: null,
    })

    expect(sentBody().sender).toEqual({ clientId: 123 })
  })

  it('never sends a weightless parcel', async () => {
    respondWith({ calculations: [calculation()] })

    await client().priceShipment({
      method: 'office',
      officeId: '9016',
      weightGrams: 0,
      codAmount: null,
    })

    expect(sentBody().content.totalWeight).toBeGreaterThan(0)
  })

  it('refuses a destination it cannot address instead of pricing something else', async () => {
    const result = await client().priceShipment({
      method: 'office',
      officeId: '',
      weightGrams: 550,
      codAmount: null,
    })

    expect(result).toEqual({
      status: 'failed',
      courier: 'speedy',
      reason: 'the parcel has no addressable destination',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses an office id that never came from Speedy', async () => {
    // Ids are numeric there and strings here, so a non-numeric one is a stored
    // value from somewhere else — an Econt office code, most likely.
    const result = await client().priceShipment({
      method: 'office',
      officeId: '1012A',
      weightGrams: 550,
      codAmount: null,
    })

    expect(result.status).toBe('failed')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the price Speedy answers', () => {
  async function rate(
    overrides: Record<string, unknown> = {},
    codAmount: Money | null = eur(19.99)
  ) {
    respondWith({ calculations: [calculation(overrides)] })

    return client().priceShipment({
      method: 'office',
      officeId: '9016',
      weightGrams: 550,
      codAmount,
    })
  }

  it('splits the наложен платеж fee off the carriage', async () => {
    const result = await rate()

    // 2.45 total, of which 0.77 net + 20% VAT is the COD fee.
    expect(result).toEqual({
      status: 'ok',
      data: {
        delivery: eur(1.53),
        codFee: eur(0.92),
        total: eur(2.45),
      },
    })
  })

  it('reconciles to the total Speedy stands behind, not to the breakdown', async () => {
    // The breakdown is net per line, so re-grossing and adding up can be a cent
    // off: 1.27 × 1.2 = 1.524 → 1.52, where the total says 1.53 is left after the
    // fee. `price.total` wins and the cent lands on delivery, which is the half
    // the customer pays — never on the total the order is built from.
    const result = await rate()

    expect(result.status === 'ok' && result.data.delivery.amountMinor + result.data.codFee.amountMinor).toBe(
      245
    )
  })

  it('counts every surcharge as delivery, including ones we have never seen', async () => {
    const result = await rate({
      price: {
        total: 6.16,
        currency: 'EUR',
        details: {
          netAmount: { amount: 1.9, vatPercent: 0.2 },
          addressDeliverySurcharge: { amount: 1.83, vatPercent: 0.2 },
          fuelSurcharge: { amount: 0.63, vatPercent: 0.2 },
          codPremium: { amount: 0.77, vatPercent: 0.2 },
          someFutureSurcharge: { amount: 0.4, vatPercent: 0.2 },
        },
      },
    })

    // A charge we silently absorbed would be a loss per parcel that nothing in
    // the system would ever report.
    expect(result).toEqual({
      status: 'ok',
      data: { delivery: eur(5.24), codFee: eur(0.92), total: eur(6.16) },
    })
  })

  it('is the whole total when nothing is collected on delivery', async () => {
    const result = await rate(
      {
        price: { total: 1.53, currency: 'EUR', details: { netAmount: { amount: 1.27, vatPercent: 0.2 } } },
      },
      null
    )

    expect(result).toEqual({
      status: 'ok',
      data: { delivery: eur(1.53), codFee: eur(0), total: eur(1.53) },
    })
  })

  it('fails rather than guess when the fee cannot be separated', async () => {
    const result = await rate({ price: { total: 2.45, currency: 'EUR' } })

    expect(result.status).toBe('failed')
    expect(result.status === 'failed' && result.reason).toContain('наложен платеж')
  })

  it('refuses a price in another currency instead of converting it', async () => {
    // The statutory BGN rate is fixed, but applying it silently would put a
    // number on the checkout that Speedy's invoice does not contain.
    const result = await rate({ price: { total: 4.79, currency: 'BGN', details: {} } })

    expect(result.status).toBe('failed')
  })

  it('reports a per-service error instead of the price it replaces', async () => {
    const result = await rate({
      price: undefined,
      error: { message: 'Ваш обект или обект по договор трябва да е платец или подател' },
    })

    expect(result).toEqual({
      status: 'failed',
      courier: 'speedy',
      reason: 'Ваш обект или обект по договор трябва да е платец или подател',
    })
  })

  it('fails when no service was priced at all', async () => {
    respondWith({ calculations: [] })

    const result = await client().priceShipment({
      method: 'office',
      officeId: '9016',
      weightGrams: 550,
      codAmount: null,
    })

    expect(result).toEqual({
      status: 'failed',
      courier: 'speedy',
      reason: 'the courier priced no service for this parcel',
    })
  })

  it('fails on a transport error with the reason attached', async () => {
    respondWith({}, 500)

    const result = await client().priceShipment({
      method: 'office',
      officeId: '9016',
      weightGrams: 550,
      codAmount: null,
    })

    expect(result.status).toBe('failed')
    expect(result.status === 'failed' && result.reason).toContain('500')
  })
})

describe('booking a waybill', () => {
  const BOOKED = {
    id: '63751169468',
    parcels: [{ id: '63751169468', seqNo: 1 }],
    pickupDate: '2026-09-21',
    deliveryDeadline: '2026-09-22T19:00:00+0300',
    price: calculation().price,
  }

  it('posts to the shipment endpoint with one service id, not a list', async () => {
    respondWith(BOOKED)

    await client().createWaybill(WAYBILL_REQUEST)

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example/v1/shipment/')
    expect(sentBody().service.serviceId).toBe(505)
    expect(sentBody().service.serviceIds).toBeUndefined()
  })

  it('names the recipient in clientName and sends no contactName', async () => {
    // With a `contactName` Speedy answers "Получател Лице за контакт: Не се очаква
    // име на контакт" and books nothing. Verified 2026-09-21.
    respondWith(BOOKED)

    await client().createWaybill(WAYBILL_REQUEST)

    expect(sentBody().recipient).toEqual({
      privatePerson: true,
      clientName: 'Мария Иванова',
      phone1: { number: '+359887115957' },
      email: 'maria@example.com',
      pickupOfficeId: 9016,
    })
  })

  it('omits the email when the customer gave none', async () => {
    respondWith(BOOKED)

    await client().createWaybill({
      ...WAYBILL_REQUEST,
      recipient: { name: 'Мария Иванова', phone: '+359887115957' },
    })

    expect(sentBody().recipient.email).toBeUndefined()
  })

  it('puts a free-text street in addressNote, which is the field Speedy reads', async () => {
    // `addressLine1` is rejected: "Попълнете улица/квартал/характерен обект … или
    // всички детайли за адреса САМО в полето „Уточнение“". Verified 2026-09-21.
    respondWith(BOOKED)

    await client().createWaybill({
      ...WAYBILL_REQUEST,
      method: 'door',
      officeId: undefined,
      address: { city: 'Пловдив', postCode: '4000', street: 'ул. Иван Вазов 12, ет. 3' },
    })

    expect(sentBody().recipient.address).toEqual({
      countryId: 100,
      siteName: 'Пловдив',
      postCode: '4000',
      addressNote: 'ул. Иван Вазов 12, ет. 3',
    })
    expect(sentBody().recipient.addressLine1).toBeUndefined()
  })

  it('carries the order number, so a parcel on a shelf can be traced back', async () => {
    respondWith(BOOKED)

    await client().createWaybill(WAYBILL_REQUEST)

    expect(sentBody().ref1).toBe('55C-2026-000123')
    expect(sentBody().content.contents).toBe('Ароматни свещи')
  })

  it('never has Speedy add the shipping to what it collects', async () => {
    // The customer already paid delivery inside the order total, so
    // `includeShippingPrice` would collect it twice.
    respondWith(BOOKED)

    await client().createWaybill(WAYBILL_REQUEST)

    expect(sentBody().service.additionalServices.cod).toEqual({
      amount: 19.99,
      currencyCode: 'EUR',
      processingType: 'CASH',
      includeShippingPrice: false,
    })
  })

  it('returns the number, the tracking link and the price', async () => {
    respondWith(BOOKED)

    expect(await client().createWaybill(WAYBILL_REQUEST)).toEqual({
      status: 'ok',
      data: {
        number: '63751169468',
        trackingUrl: speedyTrackingUrl('63751169468'),
        expectedDeliveryDate: '2026-09-22',
        price: { delivery: eur(1.53), codFee: eur(0.92), total: eur(2.45) },
      },
    })
  })

  it('reports ok without a price when the breakdown cannot be read', async () => {
    // The rule that matters most: a parcel exists and the shop is billed for it,
    // so a `failed` here would invite a retry and book a second one.
    respondWith({ ...BOOKED, price: { total: 'сума', currency: 'EUR' } })

    const result = await client().createWaybill(WAYBILL_REQUEST)

    expect(result.status).toBe('ok')
    expect(result.status === 'ok' && result.data.number).toBe('63751169468')
    expect(result.status === 'ok' && result.data.price).toBeUndefined()
  })

  it('reports ok with no delivery date when Speedy commits to none', async () => {
    respondWith({ ...BOOKED, deliveryDeadline: undefined })

    const result = await client().createWaybill(WAYBILL_REQUEST)

    expect(result.status === 'ok' && result.data.expectedDeliveryDate).toBeUndefined()
  })

  it('offers no label PDF, because Speedy prints bytes rather than a URL', async () => {
    respondWith(BOOKED)

    const result = await client().createWaybill(WAYBILL_REQUEST)

    expect(result.status === 'ok' && result.data.pdfUrl).toBeUndefined()
  })

  it('reports the courier’s own refusal when nothing was booked', async () => {
    respondWith({
      error: { message: 'Получател Адрес: Попълнете улица/квартал/характерен обект (EE2026…)' },
    })

    const result = await client().createWaybill(WAYBILL_REQUEST)

    expect(result.status).toBe('failed')
    expect(result.status === 'failed' && result.reason).toContain('Получател Адрес')
  })

  it('fails loudly on a 200 with neither a number nor an error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    respondWith({ pickupDate: '2026-09-21' })

    const result = await client().createWaybill(WAYBILL_REQUEST)

    expect(result.status).toBe('failed')
    // If the reading "nothing was created" is ever wrong, the response is the
    // only evidence there will be.
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('does not retry, because a retry books a second parcel', async () => {
    respondWith({}, 503)

    const result = await client().createWaybill(WAYBILL_REQUEST)

    expect(result.status).toBe('failed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('the касов бон on a наложен платеж parcel', () => {
  const BOOKED = { id: '63751169468', parcels: [{ id: '63751169468', seqNo: 1 }] }
  const NOT_REGISTERED = () => ({ vatGroup: 'А', vatRate: 0 })

  const WITH_RECEIPT: WaybillRequest = {
    ...WAYBILL_REQUEST,
    receipt: [
      { description: 'Свещ „Смокиня“ × 2', amount: eur(15) },
      { description: 'Доставка', amount: eur(4.99) },
    ],
  }

  it('sends the lines for Speedy to put on the receipt', async () => {
    respondWith(BOOKED)

    await client({ fiscalReceipt: NOT_REGISTERED }).createWaybill(WITH_RECEIPT)

    expect(sentBody().service.additionalServices.cod.fiscalReceiptItems).toEqual([
      { description: 'Свещ „Смокиня“ × 2', vatGroup: 'А', amount: 15, amountWithVat: 15 },
      { description: 'Доставка', vatGroup: 'А', amount: 4.99, amountWithVat: 4.99 },
    ])
  })

  it('takes the VAT out of each line once the company is registered', async () => {
    respondWith(BOOKED)

    await client({ fiscalReceipt: () => ({ vatGroup: 'Б', vatRate: 0.2 }) }).createWaybill(
      WITH_RECEIPT
    )

    expect(sentBody().service.additionalServices.cod.fiscalReceiptItems[0]).toEqual({
      description: 'Свещ „Смокиня“ × 2',
      vatGroup: 'Б',
      amount: 12.5,
      amountWithVat: 15,
    })
  })

  it('books nothing when the lines do not add up to the amount collected', async () => {
    // Speedy takes the COD amount *from* the items, so a mismatch would change
    // what the courier collects at the door.
    const result = await client({ fiscalReceipt: NOT_REGISTERED }).createWaybill({
      ...WITH_RECEIPT,
      receipt: [{ description: 'Свещ', amount: eur(15) }],
    })

    expect(result.status).toBe('failed')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('books nothing when the receipt is on but the order has no lines', async () => {
    const result = await client({ fiscalReceipt: NOT_REGISTERED }).createWaybill(WAYBILL_REQUEST)

    expect(result.status).toBe('failed')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends no lines while the contract has no receipt annex', async () => {
    respondWith(BOOKED)

    await client().createWaybill(WITH_RECEIPT)

    expect(sentBody().service.additionalServices.cod.fiscalReceiptItems).toBeUndefined()
  })

  it('never sends the lines with a quote', async () => {
    respondWith(calculation())

    await client({ fiscalReceipt: NOT_REGISTERED }).priceShipment({
      method: 'office',
      officeId: '9016',
      weightGrams: 550,
      codAmount: eur(19.99),
    })

    for (const [, init] of fetchMock.mock.calls) {
      expect(String(init.body)).not.toContain('fiscalReceiptItems')
    }
  })
})

describe('the label', () => {
  it('asks /print for an A4 sheet by parcel id, with the credentials in the body', async () => {
    fetchMock.mockImplementation(async () => new Response('%PDF-1.5 …', { status: 200 }))

    const result = await client().labelPdf!('63756228009')

    expect(result.status).toBe('ok')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.example/v1/print/')
    expect(init.method).toBe('POST')
    // Speedy answers `Accept: application/pdf` with a 406 — the production 502.
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(sentBody()).toMatchObject({
      userName: '1996702',
      password: 'secret',
      paperSize: 'A4',
      parcels: [{ parcel: { id: '63756228009' } }],
    })
  })

  it("reports Speedy's own error from a 200 that is not a PDF", async () => {
    // Observed 2026-09-25 for a parcel id that is not ours.
    respondWith({ error: { message: 'Parcel 11111111111 not found', code: 1 } })

    const result = await client().labelPdf!('11111111111')

    expect(result).toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('Parcel 11111111111 not found'),
    })
  })

  it('asks nothing without credentials', async () => {
    expect(await client({ credentials: () => null }).labelPdf!('1')).toEqual({
      status: 'unconfigured',
      courier: 'speedy',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('cancelling a waybill', () => {
  it('sends the number and a comment, once, and takes an empty answer as done', async () => {
    respondWith({})

    const result = await client().cancelWaybill!(' 63756228009 ')

    expect(result).toEqual({ status: 'ok', data: null })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example/v1/shipment/cancel/')
    expect(sentBody()).toMatchObject({
      shipmentId: '63756228009',
      comment: expect.any(String),
    })
  })

  it('never sends a request without a number, which Speedy would also answer with {}', async () => {
    respondWith({})

    expect((await client().cancelWaybill!('  ')).status).toBe('failed')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails on a refusal, such as a parcel already handed over', async () => {
    respondWith({ error: { message: 'Пратката е приета и не може да бъде анулирана' } })

    const result = await client().cancelWaybill!('63756228009')

    expect(result).toMatchObject({ status: 'failed', reason: expect.stringContaining('приета') })
  })

  it('is not retried after a server error, because the call has a side effect', async () => {
    respondWith({ message: 'Server Error' }, 503)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect((await client().cancelWaybill!('63756228009')).status).toBe('failed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('speedyTrackingUrl', () => {
  it('is the public tracking page for the number', () => {
    expect(speedyTrackingUrl('63751169468')).toBe(
      'https://www.speedy.bg/bg/track-shipment?shipmentNumber=63751169468'
    )
  })

  it('escapes anything that is not a plain number', () => {
    expect(speedyTrackingUrl('63751169468 ?x')).toContain('63751169468%20%3Fx')
  })
})

describe('tracking', () => {
  // The real answer of 2026-09-25 for a waybill that was booked and cancelled,
  // next to a number that is not ours.
  const TRACK = {
    parcels: [
      {
        parcelId: '11111111111',
        operations: [],
        error: { context: 'parcel-not-found', message: 'Пакетът не е намерен (EE1)', code: 1 },
      },
      {
        parcelId: '63756228009',
        externalCarrierParcelNumbers: [],
        operations: [
          {
            dateTime: '2026-09-25T10:25:35+0300',
            operationCode: 148,
            description: 'Получена информация за пратка',
            exceptionCodes: [],
            additionalInfo: {},
          },
          {
            dateTime: '2026-09-25T10:46:28+0300',
            operationCode: 128,
            place: 'ГР. СОФИЯ',
            description: 'Анулиране',
            exceptionCodes: [],
            additionalInfo: {},
          },
        ],
      },
    ],
  }

  it('asks /track for every number at once, with the credentials in the body', async () => {
    respondWith(TRACK)

    await client().trackShipments(['63756228009', '11111111111'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example/v1/track/')
    expect(sentBody()).toMatchObject({
      userName: '1996702',
      password: 'secret',
      parcels: [{ id: '63756228009' }, { id: '11111111111' }],
    })
  })

  it('reads the newest operation as the status and lists the history newest first', async () => {
    respondWith(TRACK)

    const result = await client().trackShipments(['63756228009', '11111111111'])

    expect(result).toEqual({
      status: 'ok',
      data: {
        found: [
          {
            number: '63756228009',
            status: 'Анулиране',
            events: [
              { at: '2026-09-25T07:46:28.000Z', text: 'Анулиране · ГР. СОФИЯ' },
              { at: '2026-09-25T07:25:35.000Z', text: 'Получена информация за пратка' },
            ],
          },
        ],
        missing: [{ number: '11111111111', reason: 'Пакетът не е намерен (EE1)' }],
      },
    })
  })

  it('claims nothing about the наложен платеж, which /track does not report', async () => {
    respondWith(TRACK)

    const result = await client().trackShipments(['63756228009'])

    expect(result.status === 'ok' && result.data.found[0]).not.toHaveProperty('codCollected')
  })

  it('reports a parcel Speedy left out of the answer as missing', async () => {
    respondWith({ parcels: [] })

    expect(await client().trackShipments(['63756228009'])).toEqual({
      status: 'ok',
      data: {
        found: [],
        missing: [{ number: '63756228009', reason: 'Speedy не върна данни за тази пратка' }],
      },
    })
  })

  it('fails on an error for the whole request, such as a bad login', async () => {
    respondWith({ error: { message: 'Невалидно потребителско име или парола' } })

    expect(await client().trackShipments(['63756228009'])).toEqual({
      status: 'failed',
      courier: 'speedy',
      reason: 'Невалидно потребителско име или парола',
    })
  })

  it('asks nothing for no numbers, and nothing without credentials', async () => {
    expect(await client().trackShipments([])).toEqual({
      status: 'ok',
      data: { found: [], missing: [] },
    })
    expect(await client({ credentials: () => null }).trackShipments(['1'])).toEqual({
      status: 'unconfigured',
      courier: 'speedy',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
