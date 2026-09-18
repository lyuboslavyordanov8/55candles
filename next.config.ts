import os, { type NetworkInterfaceInfo } from 'node:os'
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

// Every address this machine answers on, which is precisely the set of hosts the
// dev server can be reached by — Next derives the `Network:` URLs it prints on
// startup from the same interface list, so anything it advertises is covered.
//
// Hand-written patterns got this wrong: `172.16.0.*` looks like it spans the
// 172.16/12 private range but isCsrfOriginAllowed matches one dot-separated
// label at a time, so a request arriving on the Hyper-V/WSL virtual switch
// (172.27.112.1 on this host) was blocked.
//
// IPv4 only. An IPv6 origin arrives bracketed (`http://[fe80::1]:3000`) and
// would need the brackets kept to match; no browser reaches the dev server that
// way in practice.
const localDevOrigins = [
  os.hostname(),
  // Windows/mDNS also resolve the machine under its .local name.
  `${os.hostname()}.local`,
  ...Object.values(os.networkInterfaces())
    .flat()
    .filter(
      (iface): iface is NetworkInterfaceInfo =>
        iface !== undefined && iface.family === 'IPv4' && !iface.internal,
    )
    .map((iface) => iface.address),
]

// Escape hatch for testing on a real phone when the LAN path is unavailable
// (blocked inbound, client isolation, phone on mobile data, or the banner's
// `Network:` URL pointing at the host-only Hyper-V/WSL switch).
//
//     npx cloudflared tunnel --url http://localhost:3000
//
// prints a one-off https://<words>.trycloudflare.com that proxies to the dev
// server, so router and firewall drop out of the picture. The hostname is
// random per run, hence the wildcard — `*` matches exactly one label, which is
// all a quick tunnel ever uses.
//
// Also gets the dev server a secure context (real TLS), which the plain-http
// LAN URL never has.
const tunnelDevOrigins = ['*.trycloudflare.com', '*.loca.lt']

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
  // Matched against the host used to *reach* the dev server, not the client's
  // address — see localDevOrigins above. These are host patterns, NOT CIDR
  // ranges: `192.168.0.0/16` is silently treated as a hostname and matches
  // nothing.
  //
  // Note that curl cannot detect this — Next only blocks requests carrying a
  // cross-origin `Origin` header, which browsers send and curl does not. Fonts
  // under /__nextjs_font/ are fetched in CORS mode, so they are usually the
  // first thing to 403. Verify with a real browser.
  //
  // Development only; no effect on a production build.
  allowedDevOrigins: [...localDevOrigins, ...tunnelDevOrigins],

  turbopack: {
    root: projectRoot,
  },

  images: {
    // Next 16 only serves the qualities on this allowlist — the default is
    // `[75]` alone, and a `quality` prop outside the list is silently coerced
    // to the nearest entry rather than erroring. 90 is here for the large story
    // photograph (see StoryTeaser), where 75 visibly softens the tweed weave
    // and the candle's printed label. Keep the list short: every extra entry is
    // another variant an attacker can make the optimizer render.
    qualities: [75, 90],
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
