import { useTranslations } from 'next-intl'
import { formatMoney, money } from '@/lib/money'

/**
 * The priced order breakdown (AUDIT.md Q-23).
 *
 * Goods, delivery and any наложен платеж fee are separate lines because
 * Bulgarian and EU consumer law requires the customer to see each before
 * confirming — and because one opaque number invites the suspicion it deserves.
 *
 * Its own component rather than a block inside `DeliveryForm` so it can be
 * rendered and asserted on directly: the form's summary only appears after a
 * Server Action round trip, which jsdom cannot perform.
 *
 * Takes minor units, not formatted strings, so the amount crossing the boundary
 * stays an integer.
 */
export interface OrderSummaryData {
  goodsMinor: number
  shippingMinor: number
  /** Null when the merchant absorbs it, or the method is not COD. */
  codFeeMinor: number | null
  totalMinor: number
  weightGrams: number
}

export default function OrderSummary({
  summary,
  locale,
}: {
  summary: OrderSummaryData
  locale: string
}) {
  const t = useTranslations('checkout')

  return (
    <section
      aria-labelledby="order-summary-heading"
      className="space-y-2 rounded-sm border border-border bg-cream-surface p-4 text-sm"
    >
      <h2 id="order-summary-heading" className="font-serif text-base text-charcoal">
        {t('summary.title')}
      </h2>

      <Row label={t('summary.goods')} minor={summary.goodsMinor} locale={locale} />
      <Row label={t('summary.delivery')} minor={summary.shippingMinor} locale={locale} />

      {summary.codFeeMinor !== null && (
        <Row label={t('summary.codFee')} minor={summary.codFeeMinor} locale={locale} />
      )}

      <div className="border-t border-border pt-2">
        <Row label={t('summary.total')} minor={summary.totalMinor} locale={locale} emphasis />
      </div>

      <p className="text-xs text-ink-ghost">
        {t('summary.weight', { grams: summary.weightGrams })}
      </p>
    </section>
  )
}

/**
 * One line. `data-amount` gives tests something to assert on that is not
 * `Intl` output, since the rendered string is locale-formatted.
 */
function Row({
  label,
  minor,
  locale,
  emphasis = false,
}: {
  label: string
  minor: number
  locale: string
  emphasis?: boolean
}) {
  return (
    <p
      className={`flex justify-between gap-4 ${
        emphasis ? 'font-medium text-charcoal' : 'text-ink-secondary'
      }`}
    >
      <span>{label}</span>
      <span data-amount={minor} className="text-charcoal">
        {formatMoney(money(minor), locale)}
      </span>
    </p>
  )
}
