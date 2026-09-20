/**
 * Security response headers, shared by next.config.ts and its tests.
 *
 * This lives outside next.config.ts so the dev/prod difference is testable.
 * It was not, and a dev-only mistake (`upgrade-insecure-requests` applied in
 * development) shipped a completely unstyled page to anyone opening the dev
 * server from a phone on the LAN. See buildCsp below.
 */

export function buildCsp(isDev: boolean): string {
  return [
    `default-src 'self'`,
    // 'unsafe-inline' is required by Next's inline bootstrap and flight-data
    // scripts. Dev additionally needs 'unsafe-eval' for React Refresh.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    // framer-motion animates via inline styles.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    // Dev needs websockets for HMR.
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    // PRODUCTION ONLY, deliberately.
    //
    // This rewrites every subresource request to https. Correct in
    // production, fatal in development: the dev server is plain http, so
    // opening it from another device (http://192.168.x.x:3000) upgrades every
    // CSS, JS and image request to a port that speaks no TLS, and the page
    // renders as unstyled HTML.
    //
    // It does not bite on localhost, because browsers treat localhost as a
    // potentially trustworthy origin and skip the upgrade — which is why this
    // is invisible until someone opens the site on a phone.
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ].join('; ')
}

export type SecurityHeader = { key: string; value: string }

export function buildSecurityHeaders(isDev: boolean): SecurityHeader[] {
  return [
    { key: 'Content-Security-Policy', value: buildCsp(isDev) },
    // Browsers ignore HSTS over plain http, so this is inert on localhost.
    {
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Redundant with frame-ancestors above, kept for older browsers.
    { key: 'X-Frame-Options', value: 'DENY' },
    // `payment=()` disables the Payment Request API outright. Nothing to relax:
    // наложен платеж is the only payment method, so no wallet or card script is
    // ever loaded and the browser should refuse one if a page ever tries.
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=()',
    },
  ]
}
