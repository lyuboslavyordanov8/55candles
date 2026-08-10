import { describe, it, expect, afterEach } from 'vitest'
import {
  CANDLE_WEIGHT_GRAMS,
  getPricing,
  isCatalogueFullyPriced,
  isPurchasable,
  pricing,
  PLACEHOLDER_WEIGHT_GRAMS,
  PRICING_EXAMPLE,
  PRICING_IS_PROVISIONAL,
  provisionallyWeighedSlugs,
  UNIFORM_PRICE,
  unpricedSlugs,
} from '../pricing'
import { products } from '../products'
import { eur } from '@/lib/money'

const ORIGINAL = { ...pricing }

afterEach(() => {
  for (const key of Object.keys(pricing)) delete pricing[key]
  Object.assign(pricing, ORIGINAL)
})

describe('pricing table', () => {
  it("prices every product at the owner's 19,99 EUR (Q-11)", () => {
    expect(UNIFORM_PRICE.amountMinor).toBe(1999)
    expect(unpricedSlugs()).toEqual([])
    expect(isCatalogueFullyPriced()).toBe(true)

    for (const product of products) {
      expect(getPricing(product.slug)?.price).toEqual(UNIFORM_PRICE)
    }
  })

  it('stores the price as integer cents, never a float', () => {
    // 19.99 held as a float and multiplied is where a cent goes missing.
    expect(Number.isInteger(UNIFORM_PRICE.amountMinor)).toBe(true)
    expect(UNIFORM_PRICE.currency).toBe('EUR')
  })

  it('carries no stand-in weights, and says so (Q-12 answered)', () => {
    // The guard that matters: this flag drives the visible notice on the
    // product page and at checkout. The two must agree in both directions —
    // claiming real figures while a stand-in is in the table would present a
    // made-up shipping cost as a real one, and leaving the flag set once the
    // figures are real cries wolf.
    expect(provisionallyWeighedSlugs()).toEqual([])
    expect(PRICING_IS_PROVISIONAL).toBe(false)
  })

  it('weighs every product at the owner-supplied 250 g', () => {
    for (const product of products) {
      expect(pricing[product.slug]?.packedWeightGrams, product.slug).toBe(CANDLE_WEIGHT_GRAMS)
    }
    expect(CANDLE_WEIGHT_GRAMS).toBe(250)
  })

  it('documents the authoring style in integer minor units', () => {
    // 24.50 authored as major units becomes 2450 cents, never a float.
    expect(PRICING_EXAMPLE.price.amountMinor).toBe(2450)
    expect(Number.isInteger(PRICING_EXAMPLE.price.amountMinor)).toBe(true)
  })
})

describe('isPurchasable', () => {
  it('is true for the five in-season products', () => {
    const purchasable = products.filter((p) => isPurchasable(p.slug)).map((p) => p.slug)

    expect(purchasable).toHaveLength(5)
    expect(purchasable).not.toContain('winter-wonderland')
  })

  it('needs a weight as well as a price', () => {
    // A priced, weightless product would reach checkout and fail there.
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 0 }
    expect(isPurchasable('cherry')).toBe(false)

    pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }
    expect(isPurchasable('cherry')).toBe(true)
  })

  it('stays false for an out-of-season product even when priced', () => {
    const winter = products.find((p) => p.slug === 'winter-wonderland')

    // It *is* priced — the exclusion is the season, checked independently.
    expect(getPricing('winter-wonderland')).toBeDefined()
    expect(winter?.seasonal).not.toBeNull()
    expect(isPurchasable('winter-wonderland')).toBe(winter?.seasonal?.active === true)
  })

  it('is false for a slug that is not in the catalogue', () => {
    expect(isPurchasable('does-not-exist')).toBe(false)
    expect(getPricing('does-not-exist')).toBeUndefined()
  })

  it('uses one weight everywhere, so shipping bands are uniform', () => {
    for (const product of products) {
      expect(getPricing(product.slug)?.packedWeightGrams).toBe(CANDLE_WEIGHT_GRAMS)
    }
  })

  it('no longer ships the stand-in weight anywhere', () => {
    // PLACEHOLDER_WEIGHT_GRAMS is kept only as a sentinel for
    // provisionallyWeighedSlugs(); nothing in the table should equal it.
    for (const product of products) {
      expect(getPricing(product.slug)?.packedWeightGrams).not.toBe(PLACEHOLDER_WEIGHT_GRAMS)
    }
  })
})
