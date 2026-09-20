import { describe, it, expect, afterEach } from 'vitest'
import { calculateTotal, CartError, priceCart } from '../order-total'
import { eur } from '../money'
import { billableWeight, tariffs, tariffKey, type DeliveryOption } from '../shipping'
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
      // Two candles: below the free-delivery threshold, so the carriage is a
      // real charge and the arithmetic of the whole bill is visible here.
      const result = calculateTotal(
        [
          { slug: 'cherry', quantity: 1 },
          { slug: 'vanilla', quantity: 1 },
        ],
        DELIVERY
      )

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      // 24.50 + 19.99 = 44.49
      expect(result.goods.amountMinor).toBe(4449)
      expect(result.itemCount).toBe(2)
      // 500 + 450 + 150 packaging
      expect(result.weightGrams).toBe(1100)
      expect(result.shipping.amountMinor).toBe(400)
      expect(result.freeShipping).toBe(false)
      expect(result.shippingAbsorbed).toBeNull()
      expect(result.total.amountMinor).toBe(4849)
    })
  })

  it('counts candles across lines towards the free delivery (Q-24)', () => {
    withPricedCatalogue(() => {
      // Two of one scent and one of another is three candles. The promise is
      // about how many candles the customer buys, not how many rows they
      // happen to occupy.
      const result = calculateTotal(
        [
          { slug: 'cherry', quantity: 2 },
          { slug: 'vanilla', quantity: 1 },
        ],
        DELIVERY
      )

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.itemCount).toBe(3)
      expect(result.freeShipping).toBe(true)
      expect(result.shipping.amountMinor).toBe(0)
      // What the shop is paying for this parcel, kept rather than discarded so
      // the question "what is this promotion costing" stays answerable.
      expect(result.shippingAbsorbed?.amountMinor).toBe(400)
      // 2 × 24.50 + 19.99, and nothing on top.
      expect(result.total.amountMinor).toBe(6899)
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

describe('a promo discount', () => {
  it('comes off the goods, not off the delivery or the fee', () => {
    withPricedCatalogue(() => {
      // 24.50 goods, 4.00 carriage. A 2.00 code makes the bill 26.50: the
      // courier is owed the same 4.00 either way, so a discount that ate into
      // the carriage would be the shop paying part of it without saying so.
      const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY, undefined, {
        code: 'TWOOFF',
        amount: eur(2),
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.goods.amountMinor).toBe(2450)
      expect(result.discount?.amountMinor).toBe(200)
      expect(result.promoCode).toBe('TWOOFF')
      expect(result.shipping.amountMinor).toBe(400)
      expect(result.total.amountMinor).toBe(2650)
    })
  })

  it('never takes the goods below zero, however large the code', () => {
    withPricedCatalogue(() => {
      // A code worth more than the basket must not turn into a refund, and must
      // not make the delivery free by arithmetic accident.
      const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY, undefined, {
        code: 'HUGE',
        amount: eur(1000),
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.discount?.amountMinor).toBe(2450)
      expect(result.total.amountMinor).toBe(400)
    })
  })

  it('is absent, not zero, when no code was used', () => {
    withPricedCatalogue(() => {
      const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY)

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.discount).toBeNull()
      expect(result.promoCode).toBeNull()
    })
  })

  it('ignores a discount of nothing rather than showing an empty line', () => {
    withPricedCatalogue(() => {
      const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY, undefined, {
        code: 'ZERO',
        amount: eur(0),
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.discount).toBeNull()
      expect(result.promoCode).toBeNull()
      expect(result.total.amountMinor).toBe(2850)
    })
  })

  it('cannot revoke a free delivery the basket had already earned', () => {
    withPricedCatalogue(() => {
      // Three candles earn the carriage; a code then drops the goods well under
      // any value threshold. Charging for delivery here would be a charge that
      // appeared *because* the customer saved money.
      const result = calculateTotal([{ slug: 'cherry', quantity: 3 }], DELIVERY, undefined, {
        code: 'HALF',
        amount: eur(60),
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.freeShipping).toBe(true)
      expect(result.shipping.amountMinor).toBe(0)
      // 3 × 24.50 = 73.50, less 60.00.
      expect(result.total.amountMinor).toBe(1350)
    })
  })
})

describe('priceCart', () => {
  it('answers what the parcel weighs before there is a delivery price', () => {
    withPricedCatalogue(() => {
      // Split out of calculateTotal for exactly this: the courier cannot quote a
      // price without a weight, and the weight comes from the catalogue.
      const cart = priceCart([{ slug: 'cherry', quantity: 2 }])

      expect(cart.status).toBe('ok')
      if (cart.status !== 'ok') return
      expect(cart.weightGrams).toBe(billableWeight([500, 500]))
      expect(cart.goods.amountMinor).toBe(4900)
      // Candles, which is what the free-delivery rule counts — not lines.
      expect(cart.itemCount).toBe(2)
    })
  })

  it('names the slugs it could not price, rather than guessing', () => {
    withPricedCatalogue(() => {
      delete pricing.cherry

      const cart = priceCart([{ slug: 'cherry', quantity: 1 }])

      expect(cart).toEqual({ status: 'incomplete', unpriced: ['cherry'] })
    })
  })

  it('rejects a cart that could only come from tampering', () => {
    expect(() => priceCart([])).toThrow(CartError)
    expect(() => priceCart([{ slug: 'cherry', quantity: 0 }])).toThrow(CartError)
  })
})

describe('a delivery price quoted by the courier', () => {
  it('replaces the stand-in card in the total', () => {
    withPricedCatalogue(() => {
      // The card here charges 4.00; the courier says 3.44. The total must be
      // built from the courier's figure — that is the amount the customer will be
      // asked for at the door and the amount the courier will invoice us.
      const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY, {
        delivery: eur(3.44),
        codFee: eur(0.3),
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.shipping).toEqual(eur(3.44))
      expect(result.total.amountMinor).toBe(2450 + 344)
    })
  })

  it('does not turn its itemised COD fee into a charge (Q-23)', () => {
    withPricedCatalogue(() => {
      // Econt tells us the fee; the merchant still absorbs it. If this ever
      // returns a number, the customer is being charged something no page shows.
      const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY, {
        delivery: eur(3.44),
        codFee: eur(0.3),
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.codFee).toBeNull()
    })
  })

  it('prices a courier and method the card has no entry for', () => {
    withPricedCatalogue(() => {
      delete tariffs[KEY]

      const result = calculateTotal([{ slug: 'cherry', quantity: 1 }], DELIVERY, {
        delivery: eur(3.44),
        codFee: eur(0.3),
      })

      // Without the rate this is `incomplete`. With it there is nothing left for
      // the table to be missing.
      expect(result.status).toBe('ok')
    })
  })
})
