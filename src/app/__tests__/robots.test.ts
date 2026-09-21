import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * robots.txt (SEO audit finding: the disallow list stayed empty after /admin
 * and /api landed, even though the comment above it said to fill it in).
 *
 * `src/lib/site.ts` reads `NEXT_PUBLIC_SITE_URL` at module load, so each case
 * needs its own fresh import after setting the env var — see admin-auth's
 * tests for the same pattern applied to a lazily-read env var; this one is
 * frozen at import time, which is why `vi.resetModules()` is needed here and
 * not there.
 */
describe('robots', () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL
    vi.resetModules()
  })

  it('disallows everything while no real domain is configured, so previews are never indexed', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    vi.resetModules()
    const { default: robots } = await import('../robots')

    expect(robots().rules).toEqual({ userAgent: '*', disallow: '/' })
  })

  it('keeps crawlers off /admin and /api once a real domain is set', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
    vi.resetModules()
    const { default: robots } = await import('../robots')

    const rules = robots().rules as { disallow?: string | string[] }
    expect(rules.disallow).toContain('/admin')
    expect(rules.disallow).toContain('/api')
  })

  it('still lets crawlers reach /checkout, which refuses indexing itself via meta robots', async () => {
    // checkout/page.tsx sets `robots: { index: false, follow: true }` — a
    // crawler has to be able to fetch the page to see that and to follow its
    // links. Disallowing it here would silently override that choice.
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
    vi.resetModules()
    const { default: robots } = await import('../robots')

    const rules = robots().rules as { disallow?: string | string[] }
    expect(rules.disallow).not.toContain('/checkout')
  })
})
