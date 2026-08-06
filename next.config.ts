import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// Turbopack infers the workspace root from the nearest lockfile. There is an
// unrelated package-lock.json in the user's home directory, which made it
// choose that as the root and widen filesystem watching to the whole home
// folder. Pin it to this project instead.
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

const isDev = process.env.NODE_ENV === 'development'

// Baseline CSP.
//
// This is the *static* form, which is what lets the product pages stay
// statically rendered. The stricter nonce-based CSP that Next documents
// requires dynamic rendering on every request, so this is a deliberate
// trade: we keep SSG and accept 'unsafe-inline'.
//
// 'unsafe-inline' in script-src is required by Next's inline bootstrap and
// flight-data scripts; in style-src it is required by framer-motion, which
// animates via inline styles. Dev additionally needs 'unsafe-eval' (React
// Refresh) and websocket connect-src (HMR).
//
// TODO(AUDIT.md Phase 3): Stripe needs script-src https://js.stripe.com,
// frame-src https://js.stripe.com https://hooks.stripe.com and connect-src
// https://api.stripe.com. Add them in the same commit as the Stripe client.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:`,
  `font-src 'self' data:`,
  `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `upgrade-insecure-requests`,
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // Browsers ignore HSTS over plain http, so this is inert on localhost.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Redundant with frame-ancestors above, kept for older browsers.
  { key: 'X-Frame-Options', value: 'DENY' },
  // TODO(AUDIT.md Phase 3): `payment=()` disables the Payment Request API,
  // which Stripe needs for Apple Pay / Google Pay. Relax to
  // `payment=(self "https://js.stripe.com")` when wallets are enabled.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
]

const nextConfig: NextConfig = {
  // Do not advertise the framework version.
  poweredByHeader: false,

  turbopack: {
    root: projectRoot,
  },

  experimental: {
    // The only root layout lives under the dynamic [locale] segment, so there
    // is no layout to compose a global 404 from — the case this flag exists
    // for. See src/app/global-not-found.tsx.
    globalNotFound: true,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default withNextIntl(nextConfig)
