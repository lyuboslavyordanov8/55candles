import { describe, it, expect, afterEach } from 'vitest'
import { calculateTotal, CartError } from '../order-total'
import { eur } from '../money'
import { tariffs, tariffKey, type DeliveryOption } from '../shipping'
import { pricing } from '@/data/pricing'

const DELIVERY: DeliveryOption = { courier: 'econt', method: 'office' }
const KEY = tariffKey(DELIVERY)

/**
 * Both tables now ship populated, so tests snapshot and restore rather than
 * deleting: a bare `delete` would strip a real entry for every later test in
 * the run and make failures depend on file order.
 */
const PRICING_SNAPSHOT = { ...pricing }
const TARIFFS_SNAPSHOT = { ...tariffs }

afterEach(() => {
  for (const key of Object.keys(pricing)) delete pricing[key]
  Object.assign(pricing, PRICING_SNAPSHOT)

  for (const key of Object.keys(tariffs)) delete tariffs[key]
  Object.assign(tariffs, TARIFFS_SNAPSHOT)
})

/** Fixed prices and a single flat rate, so the arithmetic is checkable by hand. */
function withPricedCatalogue(run: () => void): void {
  pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }
  pricing.vanilla = { price: eur(19.99), packedWeightGrams: 450 }
  tariffs[KEY] = { bands: [{ upToGrams: null, price: eur(4) }] }

  run()
}

/** Empty both tables, to exercise the unconfigured paths. */
function withNothingConfigured(run: () => void): void {
  for (const key of Object.keys(pricing)) delete pricing[key]
  for (const key of Object.keys(tariffs)) delete tariffs[key]

  run()
}

describe('calculateTotal', () => {
  it('blocks the order while any line is unpriced (B-03)', () => {
    withNothingConfigured(() => {
      const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY)

      expect(result.status).toBe('incomplete')
      if (result.status === 'incomplete') {
        expect(result.unpriced).toEqual(['cherry'])
      }
    })
  })

  it('blocks the order when a product is priced but has no weight', () => {
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 0 }

    const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY)

    // A priced-but-weightless product would fail at the shipping step, after
    // the customer had already filled in their address.
    expect(result.status).toBe('incomplete')
  })

  it('reports the shipping problem separately from pricing', () => {
    withNothingConfigured(() => {
      pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }

      const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY)

      expect(result.status).toBe('incomplete')
      if (result.status === 'incomplete') {
        expect(result.unpriced).toEqual([])
        expect(result.shippingQuote).toEqual({ status: 'unconfigured', reason: 'noTariff' })
      }
    })
  })

  it('prices a real order from the shipped tables, end to end', () => {
    // No fixtures: the actual configured price and rate card, which is what the
    // customer will be quoted. 19.99 × 2 = 39.98 goods; 2 × 250 g candle plus
    // the 150 g carton is 650 g, which picks the first placeholder band at
    // 4.99; merchant absorbs the COD fee.
    const result = calculateTotal([{ slug: 'cherry', quantity: 2 }], DELIVERY)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.goods.amountMinor).toBe(3998)
    expect(result.weightGrams).toBe(650)
    expect(result.shipping.amountMinor).toBe(499)
    expect(result.codFee).toBeNull()
    expect(result.total.amountMinor).toBe(4497)
  })

  it('totals goods, weight and shipping once everything is configured', () => {
    withPricedCatalogue(() => {
      const result = calculateTotal(
        [
          { slug: 'cherry', quantity: 2 },
          { slug: 'vanilla', quantity: 1 },
        ],
        DELIVERY
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
      const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY)

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      // Not folded into the goods total.
      expect(result.goods.amountMinor).toBe(2450)
      expect(result.shipping.amountMinor).toBe(400)
    })
  })

  it('adds no COD fee while the merchant absorbs it (Q-23)', () => {
    withPricedCatalogue(() => {
      // Cash on delivery is the only method, so this fee is on every order or on
      // none. It is currently absorbed, which must show as a null fee rather than
      // as a zero silently folded into the total — the day the owner decides to
      // pass it on, the customer has to see it as its own line.
      const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY)

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.codFee).toBeNull()
      expect(result.total.amountMinor).toBe(
        result.goods.amountMinor + result.shipping.amountMinor
      )
    })
  })

  it('prices each line from the catalogue, not from the caller', () => {
    withPricedCatalogue(() => {
      // A cart line carries only a slug and a quantity — there is no field a
      // tampered client could use to name its own price.
      const result = calculateTotal([{ slug: 'cherry', quantity: 3 }], DELIVERY)

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.lines[0].unitPrice.amountMinor).toBe(2450)
      expect(result.lines[0].lineTotal.amountMinor).toBe(7350)
    })
  })

  it('throws on input that can only be a bug or tampering', () => {
    expect(() => calculateTotal([], DELIVERY)).toThrow(CartError)
    expect(() =>
      calculateTotal([{ slug: 'cherry', quantity: 0 }], DELIVERY)
    ).toThrow(CartError)
    expect(() =>
      calculateTotal([{ slug: 'cherry', quantity: -1 }], DELIVERY)
    ).toThrow(CartError)
    expect(() =>
      calculateTotal([{ slug: 'cherry', quantity: 1.5 }], DELIVERY)
    ).toThrow(CartError)
  })
})
