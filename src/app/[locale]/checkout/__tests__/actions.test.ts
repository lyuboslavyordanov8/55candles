import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { submitCheckout } from '../actions'
import { courierClient } from '@/lib/couriers'
import type { CourierOffice, LookupResult } from '@/lib/couriers/types'
import { eur } from '@/lib/money'
import { pricing } from '@/data/pricing'
import { tariffKey, tariffs } from '@/lib/shipping'

/**
 * The courier client is mocked for the whole file, defaulting to `unconfigured`
 * — the answer a courier with no client of its own gives. That is what the tests
 * below other than the office block assume, and stating it here beats letting
 * them reach the network or depend on the ambient environment.
 */
vi.mock('@/lib/couriers', () => ({ courierClient: vi.fn() }))

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
  }))

  return findOffice
}

beforeEach(() => {
  stubFindOffice({ status: 'unconfigured', courier: 'econt' })
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
      shippingMinor: 499,
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
      shippingMinor: 400,
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
