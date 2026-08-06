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
  { slug: 'privacy', key: 'privacy', lastUpdated: '2026-08-06' },
  { slug: 'cookies', key: 'cookies', lastUpdated: '2026-08-06' },
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
 * Every document is still a draft until a Bulgarian lawyer has reviewed it.
 * While this is true each page renders a visible warning banner, so a draft
 * cannot be mistaken for reviewed terms by a customer or by the owner.
 * Flip to `false` once review is done — `src/__tests__/legal.test.ts` checks
 * that no `[TODO:` markers remain when you do.
 */
export const LEGAL_IS_DRAFT = true
