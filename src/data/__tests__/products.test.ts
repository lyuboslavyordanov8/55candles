import { describe, it, expect } from 'vitest'
import { products, getProductBySlug } from '../products'

describe('products', () => {
  it('has exactly 6 products', () => {
    expect(products).toHaveLength(6)
  })

  it('every product has required fields with correct types', () => {
    for (const p of products) {
      expect(typeof p.id).toBe('string')
      expect(typeof p.slug).toBe('string')
      expect(typeof p.name).toBe('string')
      expect(typeof p.descriptor).toBe('string')
      expect(typeof p.accentColor).toBe('string')
      expect(p.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(p.price).toBeNull()
    }
  })

  it('winter-wonderland is the only seasonal product', () => {
    const seasonal = products.filter(p => p.seasonal !== null)
    expect(seasonal).toHaveLength(1)
    expect(seasonal[0].slug).toBe('winter-wonderland')
  })

  it('getProductBySlug returns the matching product', () => {
    const cherry = getProductBySlug('cherry')
    expect(cherry?.name).toBe('Cherry')
  })

  it('getProductBySlug returns undefined for unknown slug', () => {
    expect(getProductBySlug('does-not-exist')).toBeUndefined()
  })
})
