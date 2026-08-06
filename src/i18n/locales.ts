// Single source of truth for supported locales.
//
// This list was previously duplicated in proxy.ts, i18n/request.ts and
// products/[slug]/generateStaticParams, which is how they drift apart.
export const locales = ['en', 'bg'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value)
}
