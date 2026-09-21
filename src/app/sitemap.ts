import type { MetadataRoute } from 'next'
import { products } from '@/data/products'
import { defaultLocale, localeAlternates } from '@/i18n/locales'
import { LEGAL_DOCS, LEGAL_IS_DRAFT } from '@/lib/legal'
import { absoluteUrl } from '@/lib/site'

// Paths that exist under every locale, with their relative crawl priority.
const staticPaths: Array<{ path: string; priority: number; changeFrequency: 'weekly' | 'monthly' }> =
  [
    { path: '', priority: 1, changeFrequency: 'weekly' },
    { path: '/products', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/our-story', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/candle-care', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/contact', priority: 0.5, changeFrequency: 'monthly' },
  ]

/**
 * Emits one entry per path (using the default locale as the canonical URL)
 * with every locale — plus `x-default` — listed under alternates.languages,
 * which is how Google wants hreflang expressed in a sitemap. Emitting one
 * entry per locale instead would look like duplicate content.
 *
 * `lastModified` is only set when the caller has a real date for the
 * content. It used to be `new Date()` unconditionally, which put the build
 * timestamp — identical across all 13 URLs — on every entry. That is not a
 * lastmod, it is noise with a timestamp shape, and Google's own guidance is
 * that an inaccurate lastmod is worse than none: it can get the whole signal
 * discounted. The legal documents are the one place a real date already
 * exists (`LEGAL_DOCS[].lastUpdated`, hand-maintained — see src/lib/legal.ts)
 * so only they carry one.
 */
function entry(
  path: string,
  priority: number,
  changeFrequency: 'weekly' | 'monthly',
  lastModified?: string
): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteUrl(`/${defaultLocale}${path}`),
    ...(lastModified ? { lastModified } : {}),
    changeFrequency,
    priority,
    alternates: {
      languages: Object.fromEntries(
        Object.entries(localeAlternates(path)).map(([lang, relativeUrl]) => [
          lang,
          absoluteUrl(relativeUrl),
        ])
      ),
    },
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...staticPaths.map(({ path, priority, changeFrequency }) =>
      entry(path, priority, changeFrequency)
    ),
    ...products.map((product) => entry(`/products/${product.slug}`, 0.8, 'monthly')),
    // Legal pages send `noindex` while they are unreviewed drafts, so listing
    // them here would ask Google to crawl what the page then tells it to drop.
    // They join the sitemap when LEGAL_IS_DRAFT flips to false.
    ...(LEGAL_IS_DRAFT
      ? []
      : LEGAL_DOCS.map((doc) =>
          entry(`/legal/${doc.slug}`, 0.3, 'monthly', doc.lastUpdated)
        )),
  ]
}
