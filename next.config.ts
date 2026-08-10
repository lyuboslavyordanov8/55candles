import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { buildSecurityHeaders } from './src/lib/security-headers'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// Turbopack infers the workspace root from the nearest lockfile. There is an
// unrelated package-lock.json in the user's home directory, which made it
// choose that as the root and widen filesystem watching to the whole home
// folder. Pin it to this project instead.
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

const isDev = process.env.NODE_ENV === 'development'

// The CSP and the rest of the security headers live in
// src/lib/security-headers.ts so the dev/prod difference can be unit tested —
// see src/lib/__tests__/security-headers.test.ts.
const securityHeaders = buildSecurityHeaders(isDev)

const nextConfig: NextConfig = {
  // Do not advertise the framework version.
  poweredByHeader: false,

  // Next blocks cross-origin requests to dev-only assets by default, so
  // opening the dev server from a phone on the same network 403s every chunk,
  // React never hydrates, and the page renders as frozen SSR markup — which,
  // because entrance animations start at opacity 0, looks like a blank page.
  //
  // These are host patterns, NOT CIDR ranges: `192.168.0.0/16` is silently
  // treated as a hostname and matches nothing.
  //
  // Note that curl cannot detect this — Next only blocks requests carrying a
  // cross-origin `Origin` header, which browsers send and curl does not.
  // Verify with a real browser.
  //
  // Development only; no effect on a production build.
  allowedDevOrigins: ['192.168.1.*', '192.168.0.*', '10.0.0.*', '172.16.0.*'],

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
