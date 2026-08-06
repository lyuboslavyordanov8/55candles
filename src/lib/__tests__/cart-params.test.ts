import { describe, it, expect } from 'vitest'
import {
  checkoutHref,
  MAX_LINES,
  MAX_QUANTITY_PER_LINE,
  parseCartParam,
  toCartParam,
} from '../cart-params'

describe('parseCartParam', () => {
  it('reads slugs and quantities', () => {
    expect(parseCartParam('cherry:2,vanilla:1')).toEqual([
      { slug: 'cherry', quantity: 2 },
      { slug: 'vanilla', quantity: 1 },
    ])
  })

  it('defaults a bare slug to one', () => {
    expect(parseCartParam('cherry')).toEqual([{ slug: 'cherry', quantity: 1 }])
  })

  it('is empty for nothing, blank, or a repeated param', () => {
    expect(parseCartParam(undefined)).toEqual([])
    expect(parseCartParam('')).toEqual([])
    expect(parseCartParam('   ')).toEqual([])
    // `?items=a&items=b` arrives as an array; not a shape this supports.
    expect(parseCartParam(['cherry:1', 'vanilla:1'])).toEqual([])
  })

  it('drops slugs that are not in the catalogue', () => {
    // A stale or hand-edited link degrades to a smaller cart, not an error page.
    expect(parseCartParam('cherry:1,not-a-candle:5')).toEqual([
      { slug: 'cherry', quantity: 1 },
    ])
  })

  it('drops quantities that are not whole positive numbers', () => {
    for (const bad of ['cherry:0', 'cherry:-2', 'cherry:1.5', 'cherry:abc', 'cherry:']) {
      expect(parseCartParam(bad)).toEqual([])
    }
  })

  it('caps the quantity, because the URL is public and editable', () => {
    // Without this, `?items=cherry:99999999` reaches a confirmed total.
    expect(parseCartParam('cherry:99999999')).toEqual([
      { slug: 'cherry', quantity: MAX_QUANTITY_PER_LINE },
    ])
  })

  it('accumulates a repeated slug rather than overwriting it', () => {
    // What a naive "add to cart" link produces twice over.
    expect(parseCartParam('cherry:1,cherry:2')).toEqual([{ slug: 'cherry', quantity: 3 }])
  })

  it('caps the accumulated quantity too', () => {
    const raw = Array.from({ length: 30 }, () => 'cherry:1').join(',')

    expect(parseCartParam(raw)).toEqual([
      { slug: 'cherry', quantity: MAX_QUANTITY_PER_LINE },
    ])
  })

  it('caps the number of lines', () => {
    // The catalogue is six, so this cannot trip today — it is a bound on the
    // input, not on the catalogue, and inputs outlive catalogues.
    expect(parseCartParam('cherry:1,vanilla:1').length).toBeLessThanOrEqual(MAX_LINES)
  })

  it('carries no price field for a client to forge', () => {
    const [line] = parseCartParam('cherry:2')

    expect(Object.keys(line).sort()).toEqual(['quantity', 'slug'])
  })
})

describe('toCartParam / checkoutHref', () => {
  it('round-trips through parse', () => {
    const lines = [
      { slug: 'cherry', quantity: 2 },
      { slug: 'vanilla', quantity: 1 },
    ]

    expect(parseCartParam(toCartParam(lines))).toEqual(lines)
  })

  it('builds a locale-correct checkout link', () => {
    expect(checkoutHref('bg', 'cherry')).toBe('/bg/checkout?items=cherry%3A1')
    expect(parseCartParam('cherry:1')).toEqual([{ slug: 'cherry', quantity: 1 }])
  })

  it('encodes the quantity it is given', () => {
    expect(checkoutHref('en', 'vanilla', 3)).toContain('vanilla%3A3')
  })
})
