export interface NavLink {
  href: string
  label: string
}

/** Nav destinations, in order. Shared by the navbar and the footer. */
export const NAV_KEYS = [
  { key: 'home', path: '' },
  { key: 'products', path: '/products' },
  { key: 'ourStory', path: '/our-story' },
  { key: 'candleCare', path: '/candle-care' },
  { key: 'contact', path: '/contact' },
] as const

export type NavKey = (typeof NAV_KEYS)[number]['key']

/**
 * Build the nav list for a locale.
 *
 * `translate` is passed in rather than calling `useTranslations` here, so this
 * stays a plain function usable from both server and client components.
 */
export function navLinks(
  locale: string,
  translate: (key: NavKey) => string
): NavLink[] {
  return NAV_KEYS.map(({ key, path }) => ({
    href: `/${locale}${path}`,
    label: translate(key),
  }))
}
