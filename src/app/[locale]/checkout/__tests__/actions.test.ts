import { describe, it, expect, afterEach } from 'vitest'
import { submitCheckout } from '../actions'
import { eur } from '@/lib/money'
import { pricing } from '@/data/pricing'
import { tariffKey, tariffs } from '@/lib/shipping'

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
  paymentMethod: 'cod',
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

afterEach(() => {
  delete pricing.cherry
  delete tariffs[KEY]
})

describe('submitCheckout', () => {
  it('rejects invalid delivery details with per-field codes', async () => {
    const state = await submitCheckout(IDLE, formData({ postCode: 'abc', phone: '' }))

    expect(state.status).toBe('invalid')
    expect(state.fieldErrors?.postCode).toBe('invalid')
    expect(state.fieldErrors?.phone).toBe('required')
  })

  it('requires a known payment method', async () => {
    const state = await submitCheckout(IDLE, formData({ paymentMethod: 'bitcoin' }))

    expect(state.status).toBe('invalid')
    expect(state.messageKey).toBe('choosePayment')
  })

  it('refuses card payment while Stripe is unconfigured', async () => {
    // Reachable only by a direct POST — the UI hides the option. The action is
    // the boundary, so it must refuse rather than trust the rendered form.
    const state = await submitCheckout(IDLE, formData({ paymentMethod: 'card' }))

    expect(state.status).toBe('unconfigured')
    expect(state.messageKey).toBe('paymentUnavailable')
  })

  it('reports an unpriced product rather than charging for it', async () => {
    const state = await submitCheckout(IDLE, formData())

    expect(state.status).toBe('unconfigured')
    expect(state.unpriced).toEqual(['cherry'])
    expect(state.messageKey).toBe('notPricedYet')
  })

  it('distinguishes an unset courier tariff from an unpriced product', async () => {
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }

    const state = await submitCheckout(IDLE, formData())

    expect(state.status).toBe('unconfigured')
    expect(state.messageKey).toBe('deliveryNotPricedYet')
  })

  it('prices the order server-side and stops short of storing it', async () => {
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }
    tariffs[KEY] = { bands: [{ upToGrams: null, price: eur(4) }] }

    const state = await submitCheckout(IDLE, formData())

    expect(state.status).toBe('readyToPay')
    expect(state.messageKey).toBe('noOrderStorageYet')
    // 2 × 24.50 goods, 4.00 shipping, merchant absorbs the COD fee.
    expect(state.summary).toEqual({
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
})
