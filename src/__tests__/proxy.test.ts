import { describe, it, expect } from 'vitest'
import { addVaryOnRedirect } from '../lib/vary'

/**
 * `proxy()` itself (src/proxy.ts's default export) is not exercised here: it
 * calls next-intl's middleware, which this repo's Vitest setup cannot load
 * at all — SSR-externalised dependency resolution hits a pre-existing
 * extensionless `next/server` import inside next-intl's compiled output that
 * doesn't match Next 16's package exports, regardless of anything in this
 * change. What is unit-testable, and what this SEO fix actually changed, is
 * the header logic in `src/lib/vary.ts`, which `proxy.ts` wraps the
 * middleware's response in.
 */
describe('addVaryOnRedirect', () => {
  it('adds Vary: Accept-Language to a redirect response', () => {
    const response = addVaryOnRedirect(new Response(null, { status: 307 }))

    expect(response.headers.get('vary')).toBe('Accept-Language')
  })

  it('leaves a non-redirect response untouched', () => {
    const response = addVaryOnRedirect(new Response(null, { status: 200 }))

    expect(response.headers.get('vary')).toBeNull()
  })

  it('appends rather than overwrites an existing Vary header', () => {
    const response = addVaryOnRedirect(
      new Response(null, { status: 308, headers: { Vary: 'Cookie' } })
    )

    expect(response.headers.get('vary')).toBe('Cookie, Accept-Language')
  })
})
