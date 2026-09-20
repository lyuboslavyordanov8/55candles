import { company } from '@/lib/company'
import { absoluteUrl } from '@/lib/site'
import { locales } from '@/i18n/locales'

/**
 * Structured data (AUDIT.md S-12).
 *
 * `Product` / `Offer` are deliberately absent: an `Offer` requires a price, and
 * no product has one yet (B-03). Emitting `Product` without `offers` produces
 * Search Console warnings, so it waits for pricing.
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
        ...(company.contact.email.startsWith('[TODO:')
          ? {}
          : { email: company.contact.email }),
        telephone: company.contact.phone,
        sameAs: [company.contact.instagramUrl],
        address: {
          '@type': 'PostalAddress',
          ...address,
          addressCountry: countryCode,
        },
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: company.contact.phone,
          contactType: 'customer service',
          availableLanguage: locales.map((l) => (l === 'bg' ? 'Bulgarian' : 'English')),
        },
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
