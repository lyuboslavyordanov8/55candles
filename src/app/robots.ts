import type { MetadataRoute } from 'next'
import { absoluteUrl, isSiteUrlConfigured } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  // Without a real domain configured we are almost certainly on a preview or
  // local build. Disallow everything rather than risk a staging deployment
  // being indexed.
  if (!isSiteUrlConfigured) {
    return {
      rules: { userAgent: '*', disallow: '/' },
    }
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Nothing to hide yet. Add /api/ and any account routes here as the
      // commerce build lands (AUDIT.md Phase 2+).
      disallow: [],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  }
}
