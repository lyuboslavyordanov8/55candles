import { describe, it, expect } from 'vitest'
import { localeAlternates } from '../locales'

/**
 * hreflang completeness (SEO audit finding: `x-default` was missing from
 * every page's `alternates.languages` and from sitemap.ts, even though
 * next-intl's middleware already advertises it via the response's `Link`
 * header — verified on the wire).
 */
describe('localeAlternates', () => {
  it('maps every supported locale to the same path', () => {
    expect(localeAlternates('/products')).toMatchObject({
      bg: '/bg/products',
      en: '/en/products',
    })
  })

  it('adds x-default pointing at the default-locale URL', () => {
    expect(localeAlternates('/products')['x-default']).toBe('/bg/products')
  })

  it('handles the empty path for the homepage', () => {
    expect(localeAlternates('')).toEqual({
      bg: '/bg',
      en: '/en',
      'x-default': '/bg',
    })
  })
})
