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
