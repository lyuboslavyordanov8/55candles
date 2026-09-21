// Single source of truth for supported locales.
//
// This list was previously duplicated in proxy.ts, i18n/request.ts and
// products/[slug]/generateStaticParams, which is how they drift apart.
export const locales = ['bg', 'en'] as const

export type Locale = (typeof locales)[number]

/**
 * Bulgarian, because the shop ships to Bulgaria only (Q-07) and its customers
 * read Bulgarian.
 *
 * This is what a visitor gets when their browser asks for neither language —
 * a crawler, a link opened from a chat app, `curl`. Everyone else is still
 * matched on Accept-Language, so an English browser lands on `/en`. It is also
 * the canonical locale in the sitemap and the one hreflang points at by
 * default, so changing it changes which URL Google treats as the original.
 */
export const defaultLocale: Locale = 'bg'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value)
}

/**
 * hreflang map for a root-relative path with no locale prefix (`''`,
 * `/products`, `/products/cherry`, …): one entry per locale plus `x-default`.
 *
 * `x-default` used to be missing from every page's `alternates.languages`
 * and from `sitemap.ts`, even though next-intl's own middleware already
 * advertises it via the response's `Link` header for locale negotiation
 * (verified on the wire) — so the three channels disagreed about it. Not
 * wrong, since any one of the three is a valid hreflang signal on its own,
 * but pointless drift once there is a single function that can't forget it.
 * Points at the default-locale URL, matching what the middleware already
 * sends unauthenticated crawlers to.
 */
export function localeAlternates(path: string): Record<string, string> {
  return {
    ...Object.fromEntries(locales.map((locale) => [locale, `/${locale}${path}`])),
    'x-default': `/${defaultLocale}${path}`,
  }
}
