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
      // /admin is already `noindex` (src/app/admin/layout.tsx) and gated by
      // ADMIN_PASSWORD; this additionally keeps crawlers from spending budget
      // requesting it. /api is never HTML worth indexing. /checkout is
      // deliberately NOT here: it is `noindex, follow` (checkout/page.tsx), so
      // crawlers must still be able to fetch it to follow its links — only its
      // indexing is refused, at the meta-robots level.
      disallow: ['/admin', '/api'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  }
}
