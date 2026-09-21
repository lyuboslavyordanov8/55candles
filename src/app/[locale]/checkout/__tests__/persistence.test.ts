import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { submitCheckout } from '../actions'
import { canQuoteLiveRates, courierClient } from '@/lib/couriers'
import type { CourierOffice, LookupResult, ShipmentRate } from '@/lib/couriers/types'
import { createOrder, isOrderStorageReady } from '@/lib/orders'

/**
 * What the action does once a database exists (AUDIT.md B-01, B-09, Q-34).
 *
 * `actions.test.ts` covers validation, pricing and the no-database path; this
 * file covers the step after them — and it is deliberately a separate file,
 * because the two need opposite worlds: there, order storage is absent and
 * `readyToPay` is the honest end of the flow; here it is present and anything
 * short of a stored order is a bug.
 *
 * `@/lib/orders` is mocked rather than pointed at a test database. What matters
 * at this boundary is *what the action asks to be stored* — server-computed
 * money, the courier's own office snapshot, one intent token — and a mock makes
 * those assertions exact. The module's own logic (idempotency, order numbers,
 * the item snapshot) is tested in `src/lib/__tests__/orders.test.ts`.
 */
vi.mock('@/lib/couriers', () => ({
  courierClient: vi.fn(),
  // No credentials and no hand-over point is the default state, so the static
  // card prices the delivery. `shipping-rates.test.ts` covers the live path.
  canQuoteLiveRates: vi.fn(() => false),
}))

vi.mock('@/lib/orders', () => ({
  INTENT_TOKEN_MAX: 100,
  isOrderStorageReady: vi.fn(() => true),
  createOrder: vi.fn(),
}))

const INTENT = 'a2ad8e34-0c2f-4d3b-9a1c-6f2f41f0f001'

const VALID_FIELDS: Record<string, string> = {
  recipientName: 'Мария Иванова',
  phone: '+359 887 115 957',
  email: 'maria@example.com',
  courier: 'econt',
  method: 'office',
  city: 'София',
  postCode: '1000',
  officeId: 'ECONT-1234',
  intentToken: INTENT,
  cart: JSON.stringify([{ slug: 'cherry', quantity: 2 }]),
  /* The confirming press. Without it the action only quotes — see actions.test.ts. */
  step: 'confirm',
}

function formData(overrides: Record<string, string> = {}): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries({ ...VALID_FIELDS, ...overrides })) {
    data.set(key, value)
  }
  return data
}

/** Drop a field entirely, which `formData` overrides cannot express. */
function formDataWithout(field: string): FormData {
  const data = formData()
  data.delete(field)
  return data
}

const IDLE = { status: 'idle' as const }

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

function stubFindOffice(result: LookupResult<CourierOffice | null>) {
  vi.mocked(courierClient).mockImplementation((courier) => ({
    courier,
    searchCities: async () => ({ status: 'unconfigured', courier }),
    officesIn: async () => ({ status: 'unconfigured', courier }),
    findOffice: async () => result,
    priceShipment: async () => ({ status: 'unconfigured', courier }),
  }))
}

/** A stored order, as `createOrder` would answer. */
function stubCreateOrder(overrides: Partial<Awaited<ReturnType<typeof createOrder>>> = {}) {
  vi.mocked(createOrder).mockResolvedValue({
    id: '0f0c2f35-d1b6-4b52-9d9c-2c9d1f8b7a11',
    orderNumber: '55C-2026-000123',
    publicToken: 'not-for-the-client',
    status: 'awaiting_cod',
    duplicate: false,
    ...overrides,
  })
}

beforeEach(() => {
  vi.mocked(isOrderStorageReady).mockReturnValue(true)
  // Stated per test rather than left over from the previous one: `clearAllMocks`
  // clears calls, not implementations, so a stale `true` here would quietly send
  // a later test down the live-pricing path.
  vi.mocked(canQuoteLiveRates).mockReturnValue(false)
  stubFindOffice({ status: 'unconfigured', courier: 'econt' })
  stubCreateOrder()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('submitCheckout, once orders can be stored', () => {
  it('stores the order and answers with its number', async () => {
    const state = await submitCheckout(IDLE, formData())

    expect(state.status).toBe('placed')
    expect(state.order?.number).toBe('55C-2026-000123')
    expect(state.messageKey).toBe('orderPlacedCod')
    expect(createOrder).toHaveBeenCalledTimes(1)
  })

  it('never puts the order token in the state the browser receives', async () => {
    // The public token is the secret half of a future confirmation address. It
    // stays server-side until there is a page to use it, so nothing sends it to
    // a browser that has no use for it yet.
    const state = await submitCheckout(IDLE, formData())

    expect(Object.keys(state.order ?? {})).toEqual(['number'])
  })

  it('still returns the priced breakdown, so the customer sees what they bought', async () => {
    const state = await submitCheckout(IDLE, formData())

    // 2 × 19,99 EUR, re-read on the server from the slug.
    expect(state.summary?.goodsMinor).toBe(3998)
    expect(state.summary?.lines).toEqual([
      { slug: 'cherry', quantity: 2, unitPriceMinor: 1999, lineTotalMinor: 3998 },
    ])
  })

  it('hands storage the server-computed money, not anything from the form', async () => {
    await submitCheckout(
      IDLE,
      // A hostile client naming its own total. Every one of these is ignored:
      // the action passes `calculateTotal`'s result, which is built from slugs.
      formData({ totalMinor: '1', goodsMinor: '1', shippingMinor: '0' })
    )

    const draft = vi.mocked(createOrder).mock.calls[0][0]
    expect(draft.total.goods.amountMinor).toBe(3998)
    expect(draft.total.total.amountMinor).toBeGreaterThan(3998)
    expect(draft.paymentMethod).toBe('cod')
  })

  it('hands storage the normalised phone number, not what was typed', async () => {
    await submitCheckout(IDLE, formData({ phone: '0887 115 957' }))

    expect(vi.mocked(createOrder).mock.calls[0][0].delivery.phone).toBe('+359887115957')
  })

  it('replays one intent token, so a double-click cannot become two orders', async () => {
    // The token comes from the page, unchanged by this form. Both submissions
    // therefore carry the same value, and `createOrder` is what deduplicates —
    // the action's job is only not to invent a fresh one per submission.
    await submitCheckout(IDLE, formData())
    await submitCheckout(IDLE, formData())

    const [first, second] = vi.mocked(createOrder).mock.calls
    expect(first[0].intentToken).toBe(INTENT)
    expect(second[0].intentToken).toBe(INTENT)
  })

  it('reports a replayed order exactly like a fresh one', async () => {
    // The customer pressed the button twice; the second press found the order
    // the first had created. They must not be told anything went wrong.
    stubCreateOrder({ duplicate: true })

    const state = await submitCheckout(IDLE, formData())

    expect(state.status).toBe('placed')
    expect(state.order?.number).toBe('55C-2026-000123')
  })

  it('refuses to store an order with no intent token', async () => {
    // Only reachable from a hand-built POST or a page rendered before the field
    // existed. Minting a token here would remove the double-submit protection
    // for exactly the request that arrived without it.
    const state = await submitCheckout(IDLE, formDataWithout('intentToken'))

    expect(state.status).toBe('error')
    expect(state.messageKey).toBe('formOutdated')
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('refuses an over-long intent token rather than storing it', async () => {
    const state = await submitCheckout(IDLE, formData({ intentToken: 'x'.repeat(101) }))

    expect(state.status).toBe('error')
    expect(state.messageKey).toBe('formOutdated')
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('says the order was not taken when storage fails', async () => {
    // The one outcome that must never read as a success: the customer has to
    // know to order another way.
    vi.mocked(createOrder).mockRejectedValue(new Error('connection refused'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const state = await submitCheckout(IDLE, formData())

    expect(state.status).toBe('error')
    expect(state.messageKey).toBe('orderNotSaved')
    expect(state.order).toBeUndefined()
    // Logged with the intent token, so a support call can be matched to it.
    expect(error.mock.calls[0][0]).toContain(INTENT)
  })

  it('falls back to the honest refusal when no database is configured', async () => {
    vi.mocked(isOrderStorageReady).mockReturnValue(false)

    const state = await submitCheckout(IDLE, formData())

    expect(state.status).toBe('readyToPay')
    expect(state.messageKey).toBe('noOrderStorageYet')
    expect(createOrder).not.toHaveBeenCalled()
  })

  describe('the collection point it stores', () => {
    it('is the courier’s own record, never the form’s copy of it', async () => {
      stubFindOffice({ status: 'ok', data: SOFIA_OFFICE })

      await submitCheckout(
        IDLE,
        formData({ officeName: 'Somewhere else', officeAddress: 'Invented street 1' })
      )

      const draft = vi.mocked(createOrder).mock.calls[0][0]
      expect(draft.office).toEqual({
        name: SOFIA_OFFICE.name,
        address: SOFIA_OFFICE.address,
      })
      expect(draft.officeVerified).toBe(true)
    })

    it('is marked unverified when the courier could not be reached', async () => {
      // Accepted, because a courier outage must not close the shop — but the
      // order carries the fact, because the waybill step has to re-check it.
      stubFindOffice({ status: 'failed', courier: 'econt', reason: 'timeout' })
      vi.spyOn(console, 'error').mockImplementation(() => {})

      await submitCheckout(IDLE, formData({ officeName: 'Econt Gladstone' }))

      const draft = vi.mocked(createOrder).mock.calls[0][0]
      expect(draft.officeVerified).toBe(false)
      expect(draft.office).toEqual({ name: 'Econt Gladstone', address: '' })
    })

    it('is absent for door delivery, and unverified', async () => {
      await submitCheckout(
        IDLE,
        formData({ method: 'door', street: 'ул. Раковски 12, ап. 4', officeId: '' })
      )

      const draft = vi.mocked(createOrder).mock.calls[0][0]
      expect(draft.office).toBeUndefined()
      expect(draft.officeVerified).toBe(false)
      expect(draft.delivery.street).toBe('ул. Раковски 12, ап. 4')
    })
  })

  it('stores the order as cash on delivery whatever the payload claims', async () => {
    // The method is the server's to decide — there is one — so a request naming
    // another cannot produce an order the shop has no way to collect.
    await submitCheckout(IDLE, formData({ paymentMethod: 'card' }))

    expect(vi.mocked(createOrder).mock.calls[0][0].paymentMethod).toBe('cod')
  })

  it('tells the customer they still owe the courier money', async () => {
    // "Order placed" alone would leave them wondering whether they had paid. The
    // one message this flow can end on has to say both halves.
    const state = await submitCheckout(IDLE, formData())

    expect(state.messageKey).toBe('orderPlacedCod')
  })
})

describe('recording where the delivery price came from', () => {
  /**
   * Months after the fact, the only way to know whether an order's shipping
   * figure was the courier's own or a stand-in is to have written it down at the
   * time. These assertions are about that record, not about the arithmetic.
   */
  function stubPricing(result: LookupResult<ShipmentRate>) {
    vi.mocked(canQuoteLiveRates).mockReturnValue(true)

    vi.mocked(courierClient).mockImplementation((courier) => ({
      courier,
      searchCities: async () => ({ status: 'unconfigured', courier }),
      officesIn: async () => ({ status: 'unconfigured', courier }),
      findOffice: async () => ({ status: 'unconfigured', courier }),
      priceShipment: async () => result,
    }))
  }

  it('marks an order the courier priced, and names the tariff line', async () => {
    stubPricing({
      status: 'ok',
      data: {
        delivery: { amountMinor: 344, currency: 'EUR' },
        codFee: { amountMinor: 30, currency: 'EUR' },
        total: { amountMinor: 374, currency: 'EUR' },
        description: 'между офисите на куриера до 1 кг',
      },
    })

    await submitCheckout(IDLE, formData())

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        rateSource: 'courier',
        rateDescription: 'между офисите на куриера до 1 кг',
      })
    )
  })

  it('marks an order the stand-in card priced', async () => {
    // The default state of a fresh clone. Stored happily — the notice on the
    // checkout page has already told the customer the rate is illustrative — but
    // stored as what it is.
    vi.mocked(canQuoteLiveRates).mockReturnValue(false)

    await submitCheckout(IDLE, formData())

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ rateSource: 'placeholder' })
    )
    expect(vi.mocked(createOrder).mock.calls[0][0].rateDescription).toBeUndefined()
  })

  it('stores nothing at all when the courier could not price the parcel', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubPricing({ status: 'failed', courier: 'econt', reason: 'HTTP 517: ExInvalidParam' })

    const state = await submitCheckout(IDLE, formData())

    // The database is available here, which is exactly why this matters: the row
    // would have been written, with a placeholder figure, under an order number
    // the customer would have been shown.
    expect(createOrder).not.toHaveBeenCalled()
    expect(state.status).toBe('error')
    expect(state.order).toBeUndefined()
    expect(error).toHaveBeenCalled()
  })
})

describe('what the two steps store', () => {
  it('stores nothing on the pricing press', async () => {
    // The first press exists so the customer can read the bill. If it wrote an
    // order, every abandoned checkout would be a parcel somebody has to cancel.
    const state = await submitCheckout(IDLE, formData({ step: 'quote' }))

    expect(state.status).toBe('quoted')
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('stores nothing for a request that does not say which step it is on', async () => {
    // A hand-built POST, or a form from before this field existed. Defaulting to
    // `confirm` would create orders nobody had been shown a price for.
    const data = formData()
    data.delete('step')

    expect((await submitCheckout(IDLE, data)).status).toBe('quoted')
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('stores the order on the confirming press', async () => {
    const state = await submitCheckout(IDLE, formData({ step: 'confirm' }))

    expect(state.status).toBe('placed')
    expect(createOrder).toHaveBeenCalledTimes(1)
  })
})

describe('what it records about a discount and a free delivery', () => {
  it('hands storage the discount the server worked out, and the code', async () => {
    // Not a figure from the form: the only thing the browser may send is the
    // code itself. 10% of 2 × 19.99 is 4.00.
    await submitCheckout(IDLE, formData({ promoCode: '55candles10', discountMinor: '3900' }))

    const { total } = vi.mocked(createOrder).mock.calls[0][0]
    expect(total.promoCode).toBe('55CANDLES10')
    expect(total.discount?.amountMinor).toBe(400)
    expect(total.total.amountMinor).toBe(3998 - 400 + 499)
  })

  it('stores no code when the one entered was not accepted', async () => {
    // The order still goes through — a typo is not a reason to lose it — but
    // nothing is recorded against a campaign that gave no discount.
    await submitCheckout(IDLE, formData({ promoCode: 'NOTACODE' }))

    const { total } = vi.mocked(createOrder).mock.calls[0][0]
    expect(total.promoCode).toBeNull()
    expect(total.discount).toBeNull()
  })

  it('records the carriage the shop absorbed, not just that it was free', async () => {
    // Three candles: the customer pays nothing for delivery. The list price has
    // to survive into storage, or "what is this promotion costing" has no answer.
    await submitCheckout(IDLE, formData({ cart: JSON.stringify([{ slug: 'cherry', quantity: 3 }]) }))

    const { total } = vi.mocked(createOrder).mock.calls[0][0]
    expect(total.freeShipping).toBe(true)
    expect(total.shipping.amountMinor).toBe(0)
    expect(total.shippingAbsorbed?.amountMinor).toBeGreaterThan(0)
    expect(total.itemCount).toBe(3)
  })

  it('charges the customer the carriage below the threshold', async () => {
    await submitCheckout(IDLE, formData({ cart: JSON.stringify([{ slug: 'cherry', quantity: 2 }]) }))

    const { total } = vi.mocked(createOrder).mock.calls[0][0]
    expect(total.freeShipping).toBe(false)
    expect(total.shippingAbsorbed).toBeNull()
    expect(total.shipping.amountMinor).toBeGreaterThan(0)
  })
})
