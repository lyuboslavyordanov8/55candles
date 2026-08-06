import { describe, it, expect, afterEach } from 'vitest'
import { calculateTotal, CartError } from '../order-total'
import { eur } from '../money'
import { tariffs, tariffKey, type DeliveryOption } from '../shipping'
import { pricing } from '@/data/pricing'

const DELIVERY: DeliveryOption = { courier: 'econt', method: 'office' }

/** Install prices and a rate card for the duration of one test. */
function withPricedCatalogue(run: () => void): void {
  pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }
  pricing.vanilla = { price: eur(19.99), packedWeightGrams: 450 }
  tariffs[tariffKey(DELIVERY)] = { bands: [{ upToGrams: null, price: eur(4) }] }

  try {
    run()
  } finally {
    delete pricing.cherry
    delete pricing.vanilla
    delete tariffs[tariffKey(DELIVERY)]
  }
}

afterEach(() => {
  delete pricing.cherry
  delete pricing.vanilla
  delete tariffs[tariffKey(DELIVERY)]
})

describe('calculateTotal', () => {
  it('blocks the order while any line is unpriced (B-03)', () => {
    const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY, 'cod')

    expect(result.status).toBe('incomplete')
    if (result.status === 'incomplete') {
      expect(result.unpriced).toEqual(['cherry'])
    }
  })

  it('blocks the order when a product is priced but has no weight', () => {
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 0 }

    const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY, 'cod')

    // A priced-but-weightless product would fail at the shipping step, after
    // the customer had already filled in their address.
    expect(result.status).toBe('incomplete')
  })

  it('reports the shipping problem separately from pricing', () => {
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }

    const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY, 'cod')

    expect(result.status).toBe('incomplete')
    if (result.status === 'incomplete') {
      expect(result.unpriced).toEqual([])
      expect(result.shippingQuote).toEqual({ status: 'unconfigured', reason: 'noTariff' })
    }
  })

  it('totals goods, weight and shipping once everything is configured', () => {
    withPricedCatalogue(() => {
      const result = calculateTotal(
        [
          { slug: 'cherry', quantity: 2 },
          { slug: 'vanilla', quantity: 1 },
        ],
        DELIVERY,
        'card'
      )

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      // 2 × 24.50 + 19.99 = 68.99
      expect(result.goods.amountMinor).toBe(6899)
      // 2 × 500 + 450 + 150 packaging
      expect(result.weightGrams).toBe(1600)
      expect(result.shipping.amountMinor).toBe(400)
      expect(result.total.amountMinor).toBe(7299)
    })
  })

  it('keeps shipping as its own line, as consumer law requires', () => {
    withPricedCatalogue(() => {
      const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY, 'card')

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      // Not folded into the goods total.
      expect(result.goods.amountMinor).toBe(2450)
      expect(result.shipping.amountMinor).toBe(400)
    })
  })

  it('adds no COD fee while the merchant absorbs it (Q-23)', () => {
    withPricedCatalogue(() => {
      const card = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY, 'card')
      const cod = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY, 'cod')

      expect(card.status).toBe('ok')
      expect(cod.status).toBe('ok')
      if (card.status !== 'ok' || cod.status !== 'ok') return

      expect(cod.codFee).toBeNull()
      expect(cod.total.amountMinor).toBe(card.total.amountMinor)
    })
  })

  it('prices each line from the catalogue, not from the caller', () => {
    withPricedCatalogue(() => {
      // A cart line carries only a slug and a quantity — there is no field a
      // tampered client could use to name its own price.
      const result = calculateTotal([{ slug: 'cherry', quantity: 3 }], DELIVERY, 'card')

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.lines[0].unitPrice.amountMinor).toBe(2450)
      expect(result.lines[0].lineTotal.amountMinor).toBe(7350)
    })
  })

  it('throws on input that can only be a bug or tampering', () => {
    expect(() => calculateTotal([], DELIVERY, 'card')).toThrow(CartError)
    expect(() =>
      calculateTotal([{ slug: 'cherry', quantity: 0 }], DELIVERY, 'card')
    ).toThrow(CartError)
    expect(() =>
      calculateTotal([{ slug: 'cherry', quantity: -1 }], DELIVERY, 'card')
    ).toThrow(CartError)
    expect(() =>
      calculateTotal([{ slug: 'cherry', quantity: 1.5 }], DELIVERY, 'card')
    ).toThrow(CartError)
  })
})
