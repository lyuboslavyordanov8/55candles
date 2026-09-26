/**
 * The legal document set (AUDIT.md B-15).
 *
 * Slugs are English on both locales deliberately: the URL is an identifier, and
 * translating it would mean the two language versions of the same document sat
 * at unrelated paths, which breaks the hreflang pairing that `sitemap.ts` and
 * every page's `alternates.languages` depend on.
 *
 * `lastUpdated` is the date the *text* last changed. It is hand-maintained on
 * purpose — a build date would reset on every deploy and tell a customer
 * nothing about whether the terms they agreed to have changed. Bump it when you
 * edit the copy in `messages/*.json`.
 */
export const LEGAL_DOCS = [
  { slug: 'terms', key: 'terms', lastUpdated: '2026-08-06' },
  { slug: 'privacy', key: 'privacy', lastUpdated: '2026-09-26' },
  { slug: 'cookies', key: 'cookies', lastUpdated: '2026-09-26' },
  { slug: 'returns', key: 'returns', lastUpdated: '2026-08-06' },
  { slug: 'complaints', key: 'complaints', lastUpdated: '2026-08-06' },
  { slug: 'delivery', key: 'delivery', lastUpdated: '2026-08-06' },
] as const

export type LegalSlug = (typeof LEGAL_DOCS)[number]['slug']

export const LEGAL_SLUGS = LEGAL_DOCS.map((doc) => doc.slug) as readonly LegalSlug[]

export function isLegalSlug(value: unknown): value is LegalSlug {
  return typeof value === 'string' && (LEGAL_SLUGS as readonly string[]).includes(value)
}

export function legalDoc(slug: LegalSlug) {
  // Non-null: the slug type guarantees a match.
  return LEGAL_DOCS.find((doc) => doc.slug === slug)!
}

/** Root-relative path for a legal document under a locale. */
export function legalPath(locale: string, slug: LegalSlug): string {
  return `/${locale}/legal/${slug}`
}

/**
 * Whether the documents still carry the "unreviewed draft" banner.
 *
 * Cleared on 2026-09-21 by the owner's decision, after the last placeholder was
 * answered: the pages are now published as the shop's actual terms, they are
 * indexable, and they appear in the sitemap. No Bulgarian lawyer has read them —
 * that is the owner's accepted risk, not something this flag can record, and
 * setting it back to `true` is all it takes to put the banner back if the texts
 * are ever reopened.
 *
 * `src/__tests__/legal.test.ts` keeps the guard that gave this flag its point:
 * no `[TODO` marker may exist in any document, banner or no banner.
 */
export const LEGAL_IS_DRAFT = false
