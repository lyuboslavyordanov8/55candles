import { useTranslations } from 'next-intl'
import { formatMoney } from '@/lib/money'
import { getPricing, isPurchasable } from '@/data/pricing'

/**
 * Price display (AUDIT.md B-03, B-12).
 *
 * Server Component — a price is static text, so it costs no client JS.
 *
 * An unpriced product renders an explicit "price on request" rather than an
 * empty space or a `0.00`. A blank looks like a rendering bug and a zero looks
 * like it is free; both erode trust at exactly the moment it matters.
 */
export default function Price({
  slug,
  locale,
  className = '',
}: {
  slug: string
  locale: string
  className?: string
}) {
  const t = useTranslations('commerce')
  const entry = getPricing(slug)

  if (!entry) {
    return (
      <p className={`text-sm text-ink-secondary ${className}`}>{t('priceOnRequest')}</p>
    )
  }

  return (
    <p className={`text-charcoal ${className}`}>
      {/*
        `data-price` is for the test suite and for any future analytics: the
        rendered string is locale-formatted, so asserting on it would couple
        tests to Intl's output rather than to the amount.
      */}
      <span data-price={entry.price.amountMinor}>{formatMoney(entry.price, locale)}</span>
      {!isPurchasable(slug) && (
        <span className="ml-2 text-xs text-ink-ghost">{t('notAvailableYet')}</span>
      )}
    </p>
  )
}
