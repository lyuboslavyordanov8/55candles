import { describe, it, expect } from 'vitest'
import { products, getProductBySlug, HOMEPAGE_PRODUCT_SLUGS, homepageProducts } from '../products'

describe('products', () => {
  it('has exactly 6 products', () => {
    expect(products).toHaveLength(6)
  })

  it('every product has required fields with correct types', () => {
    for (const p of products) {
      expect(typeof p.slug).toBe('string')
      expect(typeof p.name).toBe('string')
      expect(typeof p.accentColor).toBe('string')
      expect(p.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  // The prose used to be here — descriptor, mood, description, scent notes —
  // in English only, which is what Bulgarian visitors read (AUDIT.md B-22). It
  // is in `product.copy.<slug>` in both catalogues now, and
  // `product-copy.test.ts` checks it is complete. This guards the move: a
  // well-meant `descriptor:` added back here would render nowhere.
  it('carries no prose of its own, so the copy has one source', () => {
    for (const p of products) {
      for (const field of ['descriptor', 'mood', 'description', 'scentNotes', 'highlight']) {
        expect(p, `${p.slug} has a ${field}`).not.toHaveProperty(field)
      }
    }
  })

  // The owner's call: Strawberry Cake is the candle that actually sells. It is
  // a claim about the shop, so only one candle may make it.
  it('gives the bestseller badge to Strawberry Cake alone', () => {
    const bestsellers = products.filter((p) => p.badge === 'bestseller')
    expect(bestsellers.map((p) => p.slug)).toEqual(['strawberry'])
  })

  it('carries no price of its own, so pricing has one source', () => {
    for (const p of products) {
      // Money needs integer minor units and a currency (AUDIT.md B-12), so it
      // lives in `src/data/pricing.ts`. A second price field here would be a
      // competing source that wins or loses depending on which one is read.
      expect(p).not.toHaveProperty('price')
    }
  })

  it('winter-wonderland is the only seasonal product', () => {
    const seasonal = products.filter(p => p.seasonal !== null)
    expect(seasonal).toHaveLength(1)
    expect(seasonal[0].slug).toBe('winter-wonderland')
  })

  it('getProductBySlug returns the matching product', () => {
    const cherry = getProductBySlug('cherry')
    expect(cherry?.name).toBe('Electric Cherry')
  })

  it('getProductBySlug returns undefined for unknown slug', () => {
    expect(getProductBySlug('does-not-exist')).toBeUndefined()
  })

  it('every product slug matches its scent value', () => {
    for (const p of products) {
      expect(p.slug).toBe(p.scent)
    }
  })

  describe('homepage selection', () => {
    it('resolves every slug to a real product', () => {
      expect(() => homepageProducts()).not.toThrow()
      expect(homepageProducts()).toHaveLength(HOMEPAGE_PRODUCT_SLUGS.length)
    })

    it('preserves the configured order', () => {
      expect(homepageProducts().map((p) => p.slug)).toEqual([...HOMEPAGE_PRODUCT_SLUGS])
    })

    it('shows no out-of-season candle', () => {
      for (const p of homepageProducts()) {
        expect(p.seasonal === null || p.seasonal.active).toBe(true)
      }
    })

    // The grid is three across, so six fills two rows exactly — the winter
    // edition made it six. Changing it is fine — but it is a layout decision,
    // not a data one, so make it deliberately.
    it('holds six candles', () => {
      expect(HOMEPAGE_PRODUCT_SLUGS).toHaveLength(6)
    })

    // A new candle has no reviews yet and shows no stars rather than invented
    // ones; what is never fine is a rating without a count, or one off the scale.
    it('gives every rated homepage card a sensible rating and a count', () => {
      for (const p of homepageProducts()) {
        if (p.rating === undefined && p.reviewCount === undefined) continue
        expect(typeof p.rating, `${p.slug} has no rating`).toBe('number')
        expect(typeof p.reviewCount, `${p.slug} has no review count`).toBe('number')
        expect(p.rating!).toBeGreaterThan(0)
        expect(p.rating!).toBeLessThanOrEqual(5)
      }
    })
  })
})
