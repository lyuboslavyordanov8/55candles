import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { CourierClient, LookupResult, ShipmentRate } from '../couriers'
import type { DeliveryDetails } from '../delivery-schema'
import { deliveryRatesArePlaceholders, resolveDeliveryRate } from '../shipping-rates'
import { canQuoteLiveRates, courierClient } from '../couriers'

/**
 * Where a delivery price comes from (AUDIT.md Q-22).
 *
 * One behaviour here matters more than the rest: a *failed* live quote must not
 * fall back to the placeholder card. An order stored at an invented price looks
 * exactly like a real one, so nobody would find out until the courier invoiced
 * us. The tests are written so that making the fallback "more forgiving" fails.
 */

vi.mock('../couriers', () => ({
  courierClient: vi.fn(),
  canQuoteLiveRates: vi.fn(() => true),
}))

const OFFICE_DELIVERY: DeliveryDetails = {
  recipientName: 'Иван Петров',
  phone: '+359888111222',
  email: '',
  courier: 'econt',
  method: 'office',
  city: 'Пловдив',
  postCode: '4000',
  street: '',
  officeId: '4015',
  officeName: 'Пловдив Център',
  officeAddress: 'ул. Иван Вазов 2',
  note: '',
}

const GOODS = { amountMinor: 1999, currency: 'EUR' as const }

const RATE: ShipmentRate = {
  delivery: { amountMinor: 344, currency: 'EUR' },
  codFee: { amountMinor: 30, currency: 'EUR' },
  total: { amountMinor: 374, currency: 'EUR' },
  description: 'Куриерска услуга - между офисите на куриера до 1 кг',
}

let priceShipment: ReturnType<typeof vi.fn>

/** A courier client whose pricing answers with one prepared result. */
function stubPricing(result: LookupResult<ShipmentRate>) {
  priceShipment = vi.fn(async () => result)

  vi.mocked(courierClient).mockImplementation(
    (courier) => ({ courier, priceShipment }) as unknown as CourierClient
  )
}

beforeEach(() => {
  vi.mocked(canQuoteLiveRates).mockReturnValue(true)
  stubPricing({ status: 'ok', data: RATE })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveDeliveryRate', () => {
  it('uses the price the courier quoted for this parcel', async () => {
    const result = await resolveDeliveryRate({
      delivery: OFFICE_DELIVERY,
      weightGrams: 550,
      goods: GOODS,
    })

    expect(result).toEqual({ source: 'courier', rate: RATE })
  })

  it('asks about the office, the weight and the amount to collect — and nothing else', async () => {
    // Deliberately no name and no phone: the courier learns who the customer is
    // when there is a parcel to deliver, not while they are deciding.
    await resolveDeliveryRate({ delivery: OFFICE_DELIVERY, weightGrams: 550, goods: GOODS })

    expect(priceShipment).toHaveBeenCalledWith({
      method: 'office',
      officeId: '4015',
      weightGrams: 550,
      codAmount: GOODS,
    })
  })

  it('asks about the address for door delivery', async () => {
    await resolveDeliveryRate({
      delivery: {
        ...OFFICE_DELIVERY,
        method: 'door',
        officeId: '',
        street: 'ул. Христо Ботев 15, ап. 9',
      },
      weightGrams: 550,
      goods: GOODS,
    })

    expect(priceShipment).toHaveBeenCalledWith({
      method: 'door',
      address: { city: 'Пловдив', postCode: '4000', street: 'ул. Христо Ботев 15, ап. 9' },
      weightGrams: 550,
      codAmount: GOODS,
    })
  })

  it('collects the goods total, not a total that includes its own answer', async () => {
    // The COD amount cannot include the delivery charge we are asking for. The
    // resulting fee is a cent or two under the waybill's, which the merchant
    // absorbs — and that is the whole reason this is documented rather than
    // "fixed" by guessing a delivery charge to add.
    await resolveDeliveryRate({ delivery: OFFICE_DELIVERY, weightGrams: 550, goods: GOODS })

    expect(priceShipment.mock.calls[0][0].codAmount).toEqual(GOODS)
  })

  it('does not call the courier at all when nothing is configured to ask with', async () => {
    vi.mocked(canQuoteLiveRates).mockReturnValue(false)

    const result = await resolveDeliveryRate({
      delivery: OFFICE_DELIVERY,
      weightGrams: 550,
      goods: GOODS,
    })

    expect(result).toEqual({ source: 'placeholder' })
    expect(priceShipment).not.toHaveBeenCalled()
  })

  it('refuses to price the order when the courier could not answer', async () => {
    // The one that matters. Falling back here would store an order at a
    // placeholder price, indistinguishable from a real one.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubPricing({ status: 'failed', courier: 'econt', reason: 'HTTP 517: ExInvalidParam' })

    const result = await resolveDeliveryRate({
      delivery: OFFICE_DELIVERY,
      weightGrams: 550,
      goods: GOODS,
    })

    expect(result).toMatchObject({ source: 'unavailable' })
    expect(result).not.toMatchObject({ source: 'placeholder' })
    // Logged with the courier's own words, so the cause is recoverable from the
    // log rather than from a customer's description.
    expect(error).toHaveBeenCalledWith(expect.stringContaining('ExInvalidParam'))
  })

  it('falls back, loudly, when the courier contradicts the configuration check', async () => {
    // Nothing to be wrong about — there is no price to misreport — but the two
    // disagreeing is worth knowing about.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubPricing({ status: 'unconfigured', courier: 'econt' })

    const result = await resolveDeliveryRate({
      delivery: OFFICE_DELIVERY,
      weightGrams: 550,
      goods: GOODS,
    })

    expect(result).toEqual({ source: 'placeholder' })
    expect(warn).toHaveBeenCalled()
  })
})

describe('deliveryRatesArePlaceholders', () => {
  it('is true while no bookable courier can quote', () => {
    vi.mocked(canQuoteLiveRates).mockReturnValue(false)

    expect(deliveryRatesArePlaceholders()).toBe(true)
  })

  it('is false once every bookable courier prices its own parcels', () => {
    // The checkout's "these rates are illustrative" notice hangs off this. Left
    // true, it tells a customer their real delivery cost is made up.
    vi.mocked(canQuoteLiveRates).mockReturnValue(true)

    expect(deliveryRatesArePlaceholders()).toBe(false)
  })
})
