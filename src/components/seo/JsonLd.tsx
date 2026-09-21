import { company } from '@/lib/company'
import { absoluteUrl } from '@/lib/site'
import { locales } from '@/i18n/locales'
import { getPricing, isPurchasable } from '@/data/pricing'
import { toMajorUnits } from '@/lib/money'
import type { Product } from '@/types/product'

/**
 * Structured data (AUDIT.md S-12).
 *
 * Per the Next 16 guide (`node_modules/next/dist/docs/01-app/02-guides/json-ld.md`),
 * structured data belongs in a plain `<script>` — not `next/script`, which is
 * for executable JavaScript — and `JSON.stringify` does not sanitise strings
 * for XSS, so `<` must be escaped.
 */
function serialise(data: unknown): string {
  // `<` closes off `</script>` injection via any interpolated string.
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

function Script({ data }: { data: unknown }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialise(data) }} />
  )
}

/**
 * Identifies the trader. Uses the *legal* entity name with the brand as
 * `alternateName`, which is what B-16 requires and what lets search engines
 * connect "55° candles" to ВиреонЛабс ЕООД.
 *
 * Unresolved identity fields are omitted rather than emitted as `[TODO: …]` —
 * structured data is machine-read, so a placeholder there is worse than
 * silence. The visible impressum shows the TODOs; this does not.
 */
export function OrganizationJsonLd({ locale }: { locale: string }) {
  const legalName = locale === 'bg' ? company.legalName : company.legalNameLatin
  const { street, city, postalCode, countryCode } = company.address

  const address = Object.fromEntries(
    (
      [
        ['streetAddress', street],
        ['addressLocality', city],
        ['postalCode', postalCode],
      ] as const
    ).filter(([, value]) => !value.startsWith('[TODO:'))
  )

  const email = company.contact.email.startsWith('[TODO:') ? undefined : company.contact.email

  const contactChannel =
    company.contact.phone || email
      ? {
          '@type': 'ContactPoint' as const,
          ...(company.contact.phone ? { telephone: company.contact.phone } : {}),
          ...(email ? { email } : {}),
          contactType: 'customer service',
          availableLanguage: locales.map((l) => (l === 'bg' ? 'Bulgarian' : 'English')),
        }
      : undefined

  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: company.tradingName,
        legalName,
        // On the Bulgarian locale `legalName` is already the Cyrillic form, so
        // repeating it as an alternate says nothing; offer the transliteration
        // instead, which is what a Latin-script query would match.
        alternateName:
          locale === 'bg' ? company.legalNameLatin : company.legalName,
        url: absoluteUrl(`/${locale}`),
        // The wordmark, not the banner. This field pointed at the homepage
        // banner, which is a photograph of a table — Google shows `logo` as the
        // organisation's mark in knowledge panels, so it has to be the mark.
        logo: absoluteUrl('/images/logo-ink.png'),
        // taxID doubles as the company registration number in schema.org's
        // vocabulary; there is no dedicated ЕИК field.
        taxID: company.eik,
        ...(email ? { email } : {}),
        ...(company.contact.phone ? { telephone: company.contact.phone } : {}),
        sameAs: [company.contact.instagramUrl],
        address: {
          '@type': 'PostalAddress',
          ...address,
          addressCountry: countryCode,
        },
        // A ContactPoint needs a way to be contacted. With no published phone the
        // email is it — and if neither exists the whole node is dropped, because a
        // contact point with no channel is noise in machine-read data.
        ...(contactChannel ? { contactPoint: contactChannel } : {}),
      }}
    />
  )
}

/**
 * One candle (AUDIT.md S-12, the `Product`/`Offer` half). Previously absent
 * outright: an `Offer` needs a price, and no product had one (B-03). Pricing
 * landed in Phase 1b, so this now emits whenever a product has a price —
 * `offers` is omitted, same as before, for the few that still don't
 * (`unpricedSlugs()`), rather than emitting a `Product` with nothing to buy.
 *
 * `aggregateRating` is deliberately never emitted. `product.rating` /
 * `reviewCount` are the type's own documented placeholders — "hand-written
 * ... nothing computes them, because there is no reviews table yet"
 * (`src/types/product.ts`) — and Google's structured-data policy requires
 * review markup to reflect genuine reviews. Encoding a placeholder as machine-
 * read data is worse than showing it on the page: a person can tell "4.9 (42)"
 * next to six candles looks uniform, a rich-result parser cannot.
 */
export function ProductJsonLd({
  locale,
  product,
  description,
}: {
  locale: string
  product: Product
  description: string
}) {
  const url = absoluteUrl(`/${locale}/products/${product.slug}`)
  const pricing = getPricing(product.slug)

  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        description,
        image: absoluteUrl(product.imagePath),
        url,
        ...(pricing
          ? {
              offers: {
                '@type': 'Offer',
                url,
                priceCurrency: pricing.price.currency,
                price: toMajorUnits(pricing.price),
                availability: isPurchasable(product.slug)
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/OutOfStock',
              },
            }
          : {}),
      }}
    />
  )
}

export interface Breadcrumb {
  /** Root-relative path, already locale-prefixed. */
  href: string
  name: string
}

/**
 * Breadcrumb trail. Google requires `position` to start at 1 and be
 * contiguous, so callers pass the trail in order and the index is derived
 * rather than hand-written.
 */
export function BreadcrumbJsonLd({ items }: { items: Breadcrumb[] }) {
  if (items.length === 0) return null

  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: absoluteUrl(item.href),
        })),
      }}
    />
  )
}

/** Exported for the test suite, which asserts the XSS escaping holds. */
export const __serialise = serialise
