/**
 * Canonical origin for absolute URLs (metadataBase, sitemap, robots, OG tags).
 *
 * The production domain is still an open question (AUDIT.md Q-06), so this
 * reads NEXT_PUBLIC_SITE_URL and falls back to localhost for development
 * rather than hardcoding a guess. Set it in the hosting provider's
 * environment before launch, or canonical and OG URLs will point at
 * localhost.
 */
const FALLBACK = 'http://localhost:3000'

function normalise(value: string): string {
  // Trailing slashes produce '//' when joined with a path.
  return value.replace(/\/+$/, '')
}

export const siteUrl = normalise(process.env.NEXT_PUBLIC_SITE_URL || FALLBACK)

export const isSiteUrlConfigured = Boolean(process.env.NEXT_PUBLIC_SITE_URL)

/** Absolute URL for a root-relative path. */
export function absoluteUrl(path = '/'): string {
  return `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`
}
