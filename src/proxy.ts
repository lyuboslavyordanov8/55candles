import createMiddleware from 'next-intl/middleware'
import { defaultLocale, locales } from './i18n/locales'

export default createMiddleware({
  locales: [...locales],
  defaultLocale,
})

export const config = {
  // Note: the `.*\..*` clause excludes any path containing a dot, so requests
  // like /robots.txt never reach this proxy and are matched by the [locale]
  // segment instead. The layout validates the locale and 404s, which is what
  // stops those from rendering the homepage. See src/app/[locale]/layout.tsx.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
