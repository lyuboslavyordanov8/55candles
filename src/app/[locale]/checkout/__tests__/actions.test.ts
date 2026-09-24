import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { headers } from 'next/headers'
import { submitCheckout } from '../actions'
import { CHECKOUT_MAX_PER_WINDOW } from '../rate-limit-config'
import { canQuoteLiveRates, courierClient } from '@/lib/couriers'
import type { CourierOffice, LookupResult, ShipmentRate } from '@/lib/couriers/types'
import { eur } from '@/lib/money'
import { pricing } from '@/data/pricing'
import { tariffKey, tariffs } from '@/lib/shipping'

/**
 * The courier client is mocked for the whole file, defaulting to `unconfigured`
 * — the answer a courier with no client of its own gives. That is what the tests
 * below other than the office block assume, and stating it here beats letting
 * them reach the network or depend on the ambient environment.
 */
vi.mock('@/lib/couriers', () => ({
  courierClient: vi.fn(),
  // No credentials and no hand-over point is the default state, so the static
  // card prices the delivery. `shipping-rates.test.ts` covers the live path.
  canQuoteLiveRates: vi.fn(() => false),
}))

/**
 * `submitCheckout` now reads the client's address for its rate limiter (see
 * "Rate limiting" in `../actions.ts`), and `next/headers` throws outside a
 * real request scope — every test needs this mocked or none of them can call
 * the action at all. Each test gets a distinct address by default, the same
 * reasoning as `api/contact/__tests__/route.test.ts`'s `ipCounter`: the
 * limiter is module-level state that persists across tests in this file, so
 * without distinct addresses the tests would rate-limit each other.
 */
vi.mock('next/headers', () => ({ headers: vi.fn() }))

let ipCounter = 0

beforeEach(() => {
  ipCounter += 1
  vi.mocked(headers).mockResolvedValue(
    new Headers({ 'x-forwarded-for': `10.0.0.${ipCounter}` }) as never
  )
})

const DELIVERY = { courier: 'econt' as const, method: 'office' as const }
const KEY = tariffKey(DELIVERY)

const VALID_FIELDS: Record<string, string> = {
  recipientName: 'Мария Иванова',
  phone: '+359 887 115 957',
  email: 'maria@example.com',
  courier: 'econt',
  method: 'office',
  city: 'София',
  postCode: '1000',
  officeId: 'ECONT-1234',
  cart: JSON.stringify([{ slug: 'cherry', quantity: 2 }]),
  /*
    Checkout is two presses (`quote` then `confirm`), because the customer has to
    see the delivery charge and the total before anything is ordered. These
    fixtures stand for the second press; the first is asserted on its own below,
    and the default for a missing `step` is deliberately `quote`.
  */
  step: 'confirm',
}

function formData(overrides: Record<string, string> = {}): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries({ ...VALID_FIELDS, ...overrides })) {
    data.set(key, value)
  }
  return data
}

const IDLE = { status: 'idle' as const }

/**
 * Both tables ship populated now, so restore them rather than deleting keys —
 * a bare `delete` would strip a real entry for every later test in the run.
 */
const PRICING_SNAPSHOT = { ...pricing }
const TARIFFS_SNAPSHOT = { ...tariffs }

const SOFIA_OFFICE: CourierOffice = {
  id: 'ECONT-1234',
  courier: 'econt',
  kind: 'office',
  name: 'София Гладстон',
  address: 'ул. Цар Самуил №3',
  cityId: '41',
  cityName: 'София',
  postCode: '1000',
}

/** Make `findOffice` answer with one prepared result. */
function stubFindOffice(result: LookupResult<CourierOffice | null>) {
  const findOffice = vi.fn(async () => result)

  vi.mocked(courierClient).mockImplementation((courier) => ({
    courier,
    searchCities: async () => ({ status: 'unconfigured', courier }),
    officesIn: async () => ({ status: 'unconfigured', courier }),
    findOffice,
    // Pricing is `shipping-rates.ts`'s business and is stubbed per test where it
    // matters; unconfigured here means the static card is used, as it is with no
    // credentials set.
    priceShipment: async () => ({ status: 'unconfigured', courier }),
    // Nothing in the checkout books a parcel: that is the admin's button.
    createWaybill: async () => ({ status: 'unconfigured', courier }),
    trackShipments: async () => ({ status: 'unconfigured', courier }),
  }))

  return findOffice
}

beforeEach(() => {
  stubFindOffice({ status: 'unconfigured', courier: 'econt' })
  // The default world: nothing configured, so the static card prices delivery.
  vi.mocked(canQuoteLiveRates).mockReturnValue(false)
})

afterEach(() => {
  vi.restoreAllMocks()

  for (const key of Object.keys(pricing)) delete pricing[key]
  Object.assign(pricing, PRICING_SNAPSHOT)

  for (const key of Object.keys(tariffs)) delete tariffs[key]
  Object.assign(tariffs, TARIFFS_SNAPSHOT)
})

/** Empty both tables, to exercise the unconfigured paths. */
function withNothingConfigured(): void {
  for (const key of Object.keys(pricing)) delete pricing[key]
  for (const key of Object.keys(tariffs)) delete tariffs[key]
}

describe('submitCheckout', () => {
  it('rejects invalid delivery details with per-field codes', async () => {
    const state = await submitCheckout(IDLE, formData({ postCode: 'abc', phone: '' }))

    expect(state.status).toBe('invalid')
    expect(state.fieldErrors?.postCode).toBe('invalid')
    expect(state.fieldErrors?.phone).toBe('required')
  })

  it('refuses a courier the shop cannot book, even when everything else is valid', async () => {
    // Speedy is greyed out in the form, but the form is not a boundary. Without
    // this the shop would store an order for a parcel nobody can label, and the
    // customer would hear about it only when it failed to arrive.
    const state = await submitCheckout(IDLE, formData({ courier: 'speedy' }))

    expect(state.status).toBe('invalid')
    expect(state.fieldErrors?.courier).toBe('unavailable')
    expect(state.messageKey).toBe('fixTheFields')
    expect(state.summary).toBeUndefined()
  })

  it('ignores a payment method in the payload, because there is only one', async () => {
    // Наложен платеж is the shop's only method, so the server names it and never
    // reads this field. A hand-built POST asking for something else gets the same
    // COD order rather than an error about a choice it was never offered — and,
    // critically, not a card order.
    const state = await submitCheckout(IDLE, formData({ paymentMethod: 'card' }))

    expect(state.status).toBe('readyToPay')
    expect(state.values).not.toHaveProperty('paymentMethod')
  })

  it('reports an unpriced product rather than charging for it', async () => {
    withNothingConfigured()

    const state = await submitCheckout(IDLE, formData())

    expect(state.status).toBe('unconfigured')
    expect(state.unpriced).toEqual(['cherry'])
    expect(state.messageKey).toBe('notPricedYet')
  })

  it('distinguishes an unset courier tariff from an unpriced product', async () => {
    withNothingConfigured()
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }

    const state = await submitCheckout(IDLE, formData())

    expect(state.status).toBe('unconfigured')
    expect(state.messageKey).toBe('deliveryNotPricedYet')
  })

  it('prices a real order from the shipped tables', async () => {
    // No fixtures: the configured 19.99 price and placeholder rate card, i.e.
    // what the owner will actually see. 2 × 19.99 = 39.98;
    // 2 × 250 g + 150 g carton = 650 g → 4.99.
    const state = await submitCheckout(IDLE, formData())

    expect(state.status).toBe('readyToPay')
    expect(state.summary).toEqual({
      lines: [{ slug: 'cherry', quantity: 2, unitPriceMinor: 1999, lineTotalMinor: 3998 }],
      goodsMinor: 3998,
      discountMinor: null,
      promoCode: null,
      shippingMinor: 499,
      freeShipping: false,
      codFeeMinor: null,
      totalMinor: 4497,
      weightGrams: 650,
    })
  })

  it('names every line it priced, so the summary can show what was ordered', async () => {
    // The breakdown used to be one "Candles" figure, which told the customer
    // nothing about which candles the server had actually priced — the very
    // thing they are being asked to confirm. The unit price travels too: a line
    // total of 39,98 € has to be self-evidently two candles, not a price rise.
    const state = await submitCheckout(
      IDLE,
      formData({
        cart: JSON.stringify([
          { slug: 'cherry', quantity: 2 },
          { slug: 'orange', quantity: 1 },
        ]),
      })
    )

    expect(state.status).toBe('readyToPay')
    expect(state.summary?.lines).toEqual([
      { slug: 'cherry', quantity: 2, unitPriceMinor: 1999, lineTotalMinor: 3998 },
      { slug: 'orange', quantity: 1, unitPriceMinor: 1999, lineTotalMinor: 1999 },
    ])
    // And the lines still add up to the goods figure shown beside them.
    expect(state.summary?.goodsMinor).toBe(5997)
  })

  it('prices the order server-side and stops short of storing it', async () => {
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }
    tariffs[KEY] = { bands: [{ upToGrams: null, price: eur(4) }] }

    const state = await submitCheckout(IDLE, formData())

    expect(state.status).toBe('readyToPay')
    expect(state.messageKey).toBe('noOrderStorageYet')
    // 2 × 24.50 goods, 4.00 shipping, merchant absorbs the COD fee.
    expect(state.summary).toEqual({
      lines: [{ slug: 'cherry', quantity: 2, unitPriceMinor: 2450, lineTotalMinor: 4900 }],
      goodsMinor: 4900,
      discountMinor: null,
      promoCode: null,
      shippingMinor: 400,
      freeShipping: false,
      codFeeMinor: null,
      totalMinor: 5300,
      weightGrams: 1150,
    })
  })

  it('ignores any price the client tries to send', async () => {
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }
    tariffs[KEY] = { bands: [{ upToGrams: null, price: eur(4) }] }

    // A tampered cart naming its own price and a forged total field.
    const state = await submitCheckout(
      IDLE,
      formData({
        cart: JSON.stringify([{ slug: 'cherry', quantity: 2, price: 1, unitPrice: 1 }]),
        total: '1',
        totalMinor: '1',
      })
    )

    expect(state.status).toBe('readyToPay')
    // Re-read from the catalogue, so the forged values changed nothing.
    expect(state.summary?.goodsMinor).toBe(4900)
    expect(state.summary?.totalMinor).toBe(5300)
  })

  describe('sending the submitted details back to the form', () => {
    // React clears an uncontrolled form once its action completes, so a rejected
    // submission used to cost the customer every field they had got right. The
    // action echoes what it received; the form uses it as the fields' defaults.

    it('echoes the details back when a field is rejected', async () => {
      const state = await submitCheckout(
        IDLE,
        formData({ officeId: '', note: 'Обадете се преди доставка' })
      )

      expect(state.status).toBe('invalid')
      expect(state.values).toMatchObject({
        recipientName: 'Мария Иванова',
        email: 'maria@example.com',
        note: 'Обадете се преди доставка',
      })
    })

    it('echoes the phone number in the form that will go on the waybill', async () => {
      // Canonical, not as typed: what the customer confirms is then the same
      // string the courier and any SMS gateway are given.
      const state = await submitCheckout(IDLE, formData({ phone: '0887 115 957', officeId: '' }))

      expect(state.values?.phone).toBe('+359887115957')
    })

    it('echoes a rejected phone number as typed, so it can be corrected', async () => {
      const state = await submitCheckout(IDLE, formData({ phone: '02 123 4567' }))

      expect(state.fieldErrors?.phone).toBe('notMobile')
      expect(state.values?.phone).toBe('02 123 4567')
    })

    it('omits a field the customer left blank rather than echoing an empty string', async () => {
      // An absent key lets the form fall back to its own default, which is what
      // "left blank" should mean.
      const state = await submitCheckout(IDLE, formData({ email: '', note: '', officeId: '' }))

      expect(state.values).not.toHaveProperty('email')
      expect(state.values).not.toHaveProperty('note')
    })

    it('caps what it echoes, so a huge field cannot inflate the response', async () => {
      // Nothing to do with validation: the value comes back still too long, and
      // still carrying the message it earned.
      const state = await submitCheckout(IDLE, formData({ note: 'я'.repeat(50_000) }))

      expect(state.fieldErrors?.note).toBe('tooLong')
      expect(state.values?.note).toHaveLength(1_000)
    })

    it('echoes the details on a successful submission too', async () => {
      // There is no order behind `readyToPay` yet (Q-34) and no confirmation page
      // to move to, so wiping the form would lose details still needed.
      const state = await submitCheckout(IDLE, formData())

      expect(state.status).toBe('readyToPay')
      expect(state.values?.recipientName).toBe('Мария Иванова')
    })

    it('echoes trimmed values, not the raw input', async () => {
      const state = await submitCheckout(IDLE, formData({ recipientName: '  Мария Иванова  ' }))

      expect(state.values?.recipientName).toBe('Мария Иванова')
    })
  })

  it('reports an empty basket', async () => {
    const state = await submitCheckout(IDLE, formData({ cart: '[]' }))

    expect(state.status).toBe('invalid')
    expect(state.messageKey).toBe('cartEmpty')
  })

  it('survives a malformed cart without throwing', async () => {
    for (const cart of ['not json', '{"slug":"cherry"}', '[{"quantity":1}]', '[null]']) {
      const state = await submitCheckout(IDLE, formData({ cart }))

      expect(state.status).toBe('error')
      expect(state.messageKey).toBe('cartUnreadable')
    }
  })

  it('rejects a tampered quantity', async () => {
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }
    tariffs[KEY] = { bands: [{ upToGrams: null, price: eur(4) }] }

    for (const quantity of [0, -1, 1.5]) {
      const state = await submitCheckout(
        IDLE,
        formData({ cart: JSON.stringify([{ slug: 'cherry', quantity }]) })
      )

      expect(state.status).toBe('error')
    }
  })

  it('requires a street for door delivery and an office otherwise', async () => {
    const door = await submitCheckout(
      IDLE,
      formData({ method: 'door', officeId: '', street: '' })
    )
    expect(door.fieldErrors?.street).toBe('required')

    const office = await submitCheckout(IDLE, formData({ method: 'office', officeId: '' }))
    expect(office.fieldErrors?.officeId).toBe('required')
  })

  describe('re-checking the chosen office (B-13 step 3)', () => {
    it('rejects a code the courier does not recognise', async () => {
      // The picker's list was correct when the page loaded. A customer may be
      // submitting a tab they opened yesterday, and an office that has since
      // closed produces a parcel with nowhere to go.
      stubFindOffice({ status: 'ok', data: null })

      const state = await submitCheckout(IDLE, formData())

      expect(state.status).toBe('invalid')
      expect(state.fieldErrors?.officeId).toBe('unknown')
      expect(state.messageKey).toBe('fixTheFields')
      expect(state.summary).toBeUndefined()
    })

    it('checks the office before reading the cart, so the fixable error is the one reported', async () => {
      stubFindOffice({ status: 'ok', data: null })

      const state = await submitCheckout(IDLE, formData({ cart: 'not json' }))

      expect(state.fieldErrors?.officeId).toBe('unknown')
    })

    it('looks the office up by its code, at the submitted courier', async () => {
      // The courier comes from the submission, not from a constant: Econt is the
      // only one an order may name today (`BOOKABLE_COURIERS`), and a second one
      // must reach its own nomenclature rather than Econt's.
      const findOffice = stubFindOffice({ status: 'ok', data: null })

      await submitCheckout(IDLE, formData({ officeId: '77', officeName: 'Русе Централен' }))

      expect(courierClient).toHaveBeenCalledWith('econt')
      expect(findOffice).toHaveBeenCalledWith('77')
    })

    it('takes the snapshot from the courier and discards the form copies', async () => {
      // The form's values came from a client, and a client can say anything —
      // including an address that would be printed on a label.
      stubFindOffice({ status: 'ok', data: SOFIA_OFFICE })

      const state = await submitCheckout(
        IDLE,
        formData({ officeName: 'Anywhere I like', officeAddress: '1 Fictional Street' })
      )

      expect(state.status).toBe('readyToPay')
      expect(state.collectionPoint).toEqual({
        name: 'София Гладстон',
        address: 'ул. Цар Самуил №3',
      })
    })

    it('accepts the order when the courier cannot be reached, and says so in the log', async () => {
      // A courier outage must not close the shop. The office is checked again
      // before the waybill is created, which is where being wrong costs money.
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      stubFindOffice({
        status: 'failed',
        courier: 'econt',
        reason: 'timed out after 8000ms',
      })

      const state = await submitCheckout(
        IDLE,
        formData({ officeName: 'София Гладстон', officeAddress: 'ул. Цар Самуил №3' })
      )

      expect(state.status).toBe('readyToPay')
      // Falls back to what the customer saw, which is all we have.
      expect(state.collectionPoint).toEqual({
        name: 'София Гладстон',
        address: 'ул. Цар Самуил №3',
      })
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('re-verify before creating the waybill')
      )
    })

    it('accepts a hand-typed office from a courier it cannot query', async () => {
      // The default stub answers `unconfigured` — a courier whose credentials
      // are unset, which is how the shop runs until they are issued. The form
      // rendered a free-text field, so there is nothing to check the value
      // against, and rejecting it would leave the customer no way to order.
      const state = await submitCheckout(IDLE, formData({ officeId: 'офис Гладстон' }))

      expect(state.status).toBe('readyToPay')
      expect(state.collectionPoint).toBeUndefined()
    })

    it('does not consult the courier for door delivery', async () => {
      const findOffice = stubFindOffice({ status: 'ok', data: null })

      const state = await submitCheckout(
        IDLE,
        formData({
          method: 'door',
          officeId: '',
          street: 'ж.к. Младост 1, бл. 42, вх. Б, ет. 3, ап. 12',
        })
      )

      expect(state.status).toBe('readyToPay')
      expect(state.collectionPoint).toBeUndefined()
      expect(findOffice).not.toHaveBeenCalled()
    })

    it('omits the collection point rather than echoing a blank one', async () => {
      // `state.collectionPoint` is rendered as a confirmation, so an empty name
      // would present as a formatting bug at the least reassuring moment.
      stubFindOffice({ status: 'failed', courier: 'econt', reason: 'HTTP 500' })
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const state = await submitCheckout(IDLE, formData({ officeName: '' }))

      expect(state.status).toBe('readyToPay')
      expect(state.collectionPoint).toBeUndefined()
    })
  })
})

describe('submitCheckout, when the courier prices the parcel', () => {
  /**
   * Both halves configured: the shop believes it can get a live quote, and the
   * client answers one. This is the state the shop runs in once the Econt
   * contract is in place, so it is the state the interesting failures live in.
   */
  function stubPricing(result: LookupResult<ShipmentRate>) {
    vi.mocked(canQuoteLiveRates).mockReturnValue(true)

    vi.mocked(courierClient).mockImplementation((courier) => ({
      courier,
      searchCities: async () => ({ status: 'unconfigured', courier }),
      officesIn: async () => ({ status: 'unconfigured', courier }),
      findOffice: async () => ({ status: 'unconfigured', courier }),
      priceShipment: async () => result,
      createWaybill: async () => ({ status: 'unconfigured', courier }),
      trackShipments: async () => ({ status: 'unconfigured', courier }),
    }))
  }

  it('charges the courier\'s price rather than the rate card\'s', async () => {
    stubPricing({
      status: 'ok',
      data: {
        delivery: eur(3.44),
        codFee: eur(0.3),
        total: eur(3.74),
        description: 'между офисите на куриера до 1 кг',
      },
    })

    const state = await submitCheckout(IDLE, formData())

    // The stand-in card's first band is 4.99; Econt said 3.44. The summary the
    // customer reads must be the second one — and it must not be an average, a
    // maximum, or the card's figure with the quote logged beside it.
    expect(state.summary?.shippingMinor).toBe(344)
    expect(state.summary?.totalMinor).toBe(state.summary!.goodsMinor + 344)
  })

  it('refuses the order when the courier cannot price it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubPricing({ status: 'failed', courier: 'econt', reason: 'HTTP 517: ExInvalidParam' })

    const state = await submitCheckout(IDLE, formData())

    // Not `placed`, not `readyToPay`, and no summary: the only price we could
    // have shown is the placeholder, and an order stored at a made-up price is
    // indistinguishable from a real one. The customer is asked to try again.
    expect(state.status).toBe('error')
    expect(state.messageKey).toBe('deliveryRateUnavailable')
    expect(state.summary).toBeUndefined()
    // And the details they typed come back, so a retry is one click.
    expect(state.values?.recipientName).toBe('Мария Иванова')
    expect(error).toHaveBeenCalled()
  })

  it('keeps the customer\'s details out of the quote', async () => {
    // A price depends on the office, the weight and the amount to collect. The
    // courier gets the name and phone number when there is a parcel for it to
    // carry — not while the customer is still deciding whether to buy.
    let asked: unknown
    vi.mocked(canQuoteLiveRates).mockReturnValue(true)
    vi.mocked(courierClient).mockImplementation((courier) => ({
      courier,
      searchCities: async () => ({ status: 'unconfigured', courier }),
      officesIn: async () => ({ status: 'unconfigured', courier }),
      findOffice: async () => ({ status: 'unconfigured', courier }),
      createWaybill: async () => ({ status: 'unconfigured', courier }),
      trackShipments: async () => ({ status: 'unconfigured', courier }),
      priceShipment: async (request) => {
        asked = request
        return { status: 'ok', data: { delivery: eur(3.44), codFee: eur(0.3), total: eur(3.74) } }
      },
    }))

    await submitCheckout(IDLE, formData())

    expect(Object.keys(asked as object).sort()).toEqual([
      'codAmount',
      'method',
      'officeId',
      'weightGrams',
    ])
  })
})

describe('the two steps a checkout takes', () => {
  // Why there are two: the customer has to see the delivery charge and the total
  // before anything is ordered, and the delivery charge does not exist until the
  // form has been sent — Econt prices this parcel to this office. So the first
  // press prices and the second commits.

  it('prices the order and stores nothing on the first press', async () => {
    const state = await submitCheckout(IDLE, formData({ step: 'quote' }))

    expect(state.status).toBe('quoted')
    expect(state.order).toBeUndefined()
    // With the whole bill in hand — which is the point of stopping here.
    expect(state.summary?.shippingMinor).toBe(499)
    expect(state.summary?.totalMinor).toBe(4497)
    expect(state.messageKey).toBe('reviewBeforeConfirming')
  })

  it('treats a request that does not say which step it is on as a quote', async () => {
    // A hand-built POST, or a form rendered before the field existed. The default
    // has to be the harmless half: the failure mode of guessing `confirm` is a
    // parcel the customer never knowingly ordered.
    const data = formData()
    data.delete('step')

    expect((await submitCheckout(IDLE, data)).status).toBe('quoted')
  })

  it('treats an unrecognised step as a quote rather than as a confirmation', async () => {
    // Whitelisted, not `!== 'quote'`: a typo must not be able to create an order.
    for (const step of ['CONFIRM', 'confirm ', 'yes', '']) {
      expect((await submitCheckout(IDLE, formData({ step }))).status).toBe('quoted')
    }
  })

  it('gets past the quote only when the request says confirm', async () => {
    // `readyToPay` rather than `placed` because no database is configured in this
    // file — what matters is that it is no longer `quoted`. `persistence.test.ts`
    // covers the stored order.
    const state = await submitCheckout(IDLE, formData({ step: 'confirm' }))

    expect(state.status).toBe('readyToPay')
  })

  it('quotes the same figures the confirmation will charge', async () => {
    // The two presses must not be able to disagree. They price identically here
    // because the only difference between them is what happens after the total.
    const quoted = await submitCheckout(IDLE, formData({ step: 'quote' }))
    const confirmed = await submitCheckout(IDLE, formData({ step: 'confirm' }))

    expect(quoted.summary).toEqual(confirmed.summary)
  })

  it('still refuses an invalid form on the first press', async () => {
    // The quote step is not a free pass through validation: a price for an
    // address the courier cannot deliver to is not a price.
    const state = await submitCheckout(IDLE, formData({ step: 'quote', phone: '02 123 4567' }))

    expect(state.status).toBe('invalid')
    expect(state.summary).toBeUndefined()
  })
})

describe('a promo code at checkout', () => {
  it('takes a valid code off the goods and reports it applied', async () => {
    // The shipped 10% code against 2 × 19.99: 4.00 off the goods, delivery
    // untouched at 4.99.
    const state = await submitCheckout(IDLE, formData({ promoCode: '55candles10' }))

    expect(state.promo).toEqual({ status: 'applied', code: '55CANDLES10' })
    expect(state.summary?.discountMinor).toBe(400)
    expect(state.summary?.promoCode).toBe('55CANDLES10')
    expect(state.summary?.shippingMinor).toBe(499)
    expect(state.summary?.totalMinor).toBe(3998 - 400 + 499)
  })

  it('says a code is not valid without refusing the order', async () => {
    // A mistyped code is not a reason to lose the order. The customer is told,
    // beside the field, and the bill is the one without it.
    const state = await submitCheckout(IDLE, formData({ promoCode: 'NOTACODE' }))

    expect(state.status).toBe('readyToPay')
    expect(state.promo).toEqual({ status: 'unknown', code: 'NOTACODE' })
    expect(state.summary?.discountMinor).toBeNull()
    expect(state.summary?.totalMinor).toBe(4497)
  })

  it('reports the code on the quote, so it can be checked before confirming', async () => {
    const state = await submitCheckout(IDLE, formData({ step: 'quote', promoCode: '55CANDLES10' }))

    expect(state.status).toBe('quoted')
    expect(state.promo).toEqual({ status: 'applied', code: '55CANDLES10' })
    expect(state.summary?.discountMinor).toBe(400)
  })

  it('says nothing at all about a field that was left empty', async () => {
    // `undefined`, not a status: "that code is not valid" under an untouched box
    // is a support message waiting to happen.
    const state = await submitCheckout(IDLE, formData({ promoCode: '   ' }))

    expect(state.promo).toBeUndefined()
    expect(state.summary?.discountMinor).toBeNull()
  })

  it('reports the code even when the courier cannot price the parcel', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(canQuoteLiveRates).mockReturnValue(true)
    vi.mocked(courierClient).mockImplementation((courier) => ({
      courier,
      searchCities: async () => ({ status: 'unconfigured', courier }),
      officesIn: async () => ({ status: 'unconfigured', courier }),
      findOffice: async () => ({ status: 'unconfigured', courier }),
      priceShipment: async () => ({ status: 'failed', courier, reason: 'HTTP 517' }),
      createWaybill: async () => ({ status: 'unconfigured', courier }),
      trackShipments: async () => ({ status: 'unconfigured', courier }),
    }))

    const state = await submitCheckout(IDLE, formData({ promoCode: 'NOTACODE' }))

    // The retry must not silently drop what the customer typed — including the
    // news that it was wrong, which is the thing they need to fix before retrying.
    expect(state.status).toBe('error')
    expect(state.promo).toEqual({ status: 'unknown', code: 'NOTACODE' })
    expect(error).toHaveBeenCalled()
  })

  it('ignores a discount the client tries to name for itself', async () => {
    // The only thing the form may send is a code. A `discountMinor` in the
    // payload is a browser naming its own price, and is not read at all.
    const state = await submitCheckout(
      IDLE,
      formData({ discountMinor: '3900', discount: '39.00', totalMinor: '1' })
    )

    expect(state.summary?.discountMinor).toBeNull()
    expect(state.summary?.totalMinor).toBe(4497)
  })

  it('caps what it reads from the field, so a huge code cannot inflate the reply', async () => {
    const state = await submitCheckout(IDLE, formData({ promoCode: 'X'.repeat(5_000) }))

    expect(state.promo?.status).toBe('unknown')
    expect(state.promo?.code.length).toBeLessThanOrEqual(40)
  })
})

describe('submitCheckout rate limiting (security review)', () => {
  /**
   * Distinct from the `10.0.0.N` addresses the top-level `beforeEach` hands
   * out — those exist precisely so unrelated tests do not share a budget with
   * each other, and these tests need the opposite: every call in a block below
   * must land on the very same key.
   */
  const SAME_CLIENT = '198.51.100.7'
  const OTHER_CLIENT = '198.51.100.8'

  function fromSameClient() {
    vi.mocked(headers).mockResolvedValue(new Headers({ 'x-forwarded-for': SAME_CLIENT }) as never)
  }

  it("refuses a submission once one client's window is spent, before the courier or the database is touched", async () => {
    fromSameClient()
    const findOffice = stubFindOffice({ status: 'unconfigured', courier: 'econt' })

    for (let i = 0; i < CHECKOUT_MAX_PER_WINDOW; i += 1) {
      const state = await submitCheckout(IDLE, formData())
      expect(state.messageKey).not.toBe('rateLimited')
    }

    const callsBeforeTheLimitedOne = findOffice.mock.calls.length

    const limited = await submitCheckout(IDLE, formData())

    expect(limited).toEqual({ status: 'error', messageKey: 'rateLimited' })
    // The whole point: a request over budget must never reach resolveOffice
    // (which calls the courier) or anything past it.
    expect(findOffice.mock.calls.length).toBe(callsBeforeTheLimitedOne)
  })

  it('does not share one client\'s budget with another', async () => {
    fromSameClient()

    for (let i = 0; i < CHECKOUT_MAX_PER_WINDOW; i += 1) {
      await submitCheckout(IDLE, formData())
    }

    vi.mocked(headers).mockResolvedValue(new Headers({ 'x-forwarded-for': OTHER_CLIENT }) as never)

    const state = await submitCheckout(IDLE, formData())

    expect(state.messageKey).not.toBe('rateLimited')
  })
})
