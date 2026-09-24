import type { NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { defaultLocale, locales } from './i18n/locales'
import { addVaryOnRedirect } from './lib/vary'

const intlMiddleware = createMiddleware({
  locales: [...locales],
  defaultLocale,
  // `/` always opens in Bulgarian. With detection on, an English browser — or a
  // NEXT_LOCALE cookie left by one visit to /en — sent the shop's own customers to
  // the English site. English stays one click away in the language switcher.
  localeDetection: false,
})

export default function proxy(request: NextRequest) {
  return addVaryOnRedirect(intlMiddleware(request))
}

export const config = {
  // Note: the `.*\..*` clause excludes any path containing a dot, so requests
  // like /robots.txt never reach this proxy and are matched by the [locale]
  // segment instead. The layout validates the locale and 404s, which is what
  // stops those from rendering the homepage. See src/app/[locale]/layout.tsx.
  // `admin` is excluded because the admin is not a localised part of the site: it
  // lives outside `[locale]`, is Bulgarian only, and being rewritten to
  // /bg/admin would 404 it.
  matcher: ['/((?!api|admin|_next|_vercel|.*\\..*).*)'],
}
