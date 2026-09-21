import { describe, it, expect } from 'vitest'
import sitemap from '../sitemap'
import { LEGAL_DOCS } from '@/lib/legal'

/**
 * sitemap.xml lastmod (SEO audit finding: every entry carried `new Date()`,
 * i.e. the build timestamp, as if it were the content's real last-modified
 * date — identical across all 13 URLs and true of none of them).
 */
describe('sitemap lastModified', () => {
  const entries = sitemap()

  it('does not invent a lastModified date for pages with no real one', () => {
    for (const entry of entries) {
      if (entry.url.includes('/legal/')) continue // only these are date-tracked
      expect(
        entry.lastModified,
        `${entry.url} should not carry a fabricated lastModified`
      ).toBeUndefined()
    }
  })

  it('carries each legal document\'s real, hand-maintained lastUpdated date', () => {
    for (const doc of LEGAL_DOCS) {
      const entry = entries.find((e) => e.url.endsWith(`/legal/${doc.slug}`))
      expect(entry?.lastModified).toBe(doc.lastUpdated)
    }
  })
})
