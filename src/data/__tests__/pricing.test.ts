import { describe, it, expect, afterEach } from 'vitest'
import {
  getPricing,
  isCatalogueFullyPriced,
  isPurchasable,
  pricing,
  PRICING_EXAMPLE,
  unpricedSlugs,
} from '../pricing'
import { products } from '../products'
import { eur } from '@/lib/money'

afterEach(() => {
  delete pricing.cherry
  delete pricing['winter-wonderland']
})

describe('pricing table', () => {
  it('is empty, because nobody has supplied prices yet (B-03, Q-11)', () => {
    // If this fails, someone invented a price. A guessed price is a wrong
    // price, and it would be charged to a real customer.
    expect(Object.keys(pricing)).toHaveLength(0)
    expect(isCatalogueFullyPriced()).toBe(false)
  })

  it('names every product as awaiting a price', () => {
    expect(unpricedSlugs()).toEqual(products.map((p) => p.slug))
  })

  it('documents the authoring style in integer minor units', () => {
    // 24.50 authored as major units becomes 2450 cents, never a float.
    expect(PRICING_EXAMPLE.price.amountMinor).toBe(2450)
    expect(Number.isInteger(PRICING_EXAMPLE.price.amountMinor)).toBe(true)
  })
})

describe('isPurchasable', () => {
  it('is false for everything while the table is empty', () => {
    for (const product of products) {
      expect(isPurchasable(product.slug)).toBe(false)
    }
  })

  it('needs a weight as well as a price', () => {
    // A priced, weightless product would reach checkout and fail there.
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 0 }
    expect(isPurchasable('cherry')).toBe(false)

    pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }
    expect(isPurchasable('cherry')).toBe(true)
  })

  it('stays false for an out-of-season product even when priced', () => {
    pricing['winter-wonderland'] = { price: eur(24.5), packedWeightGrams: 500 }

    const winter = products.find((p) => p.slug === 'winter-wonderland')
    // The fixture this relies on: it is the one seasonal product.
    expect(winter?.seasonal).not.toBeNull()

    expect(isPurchasable('winter-wonderland')).toBe(winter?.seasonal?.active === true)
  })

  it('is false for a slug that is not in the catalogue', () => {
    expect(isPurchasable('does-not-exist')).toBe(false)
    expect(getPricing('does-not-exist')).toBeUndefined()
  })
})
