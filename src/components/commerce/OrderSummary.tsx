import { useTranslations } from 'next-intl'
import { formatMoney, money } from '@/lib/money'
import { getProductBySlug } from '@/data/products'

/**
 * The priced order breakdown (AUDIT.md Q-23).
 *
 * Every candle by name, then goods, delivery and any наложен платеж fee as
 * separate lines — because Bulgarian and EU consumer law requires the customer
 * to see each before confirming, and because one opaque number invites the
 * suspicion it deserves. "Candles — 19,99 €" told the customer nothing about
 * *which* candles the server had priced, which is precisely what they are being
 * asked to confirm.
 *
 * Its own component rather than a block inside `DeliveryForm` so it can be
 * rendered and asserted on directly: the form's summary only appears after a
 * Server Action round trip, which jsdom cannot perform.
 *
 * Takes minor units, not formatted strings, so the amount crossing the boundary
 * stays an integer.
 */

/** One priced line, as the *server* totalled it. Not what the form sent. */
export interface OrderSummaryLine {
  slug: string
  quantity: number
  unitPriceMinor: number
  lineTotalMinor: number
}

export interface OrderSummaryData {
  /** The lines the server priced, in catalogue order. */
  lines: OrderSummaryLine[]
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

      {/*
        The candles themselves, named and counted. The quantity is repeated as
        `2 × 19,99 €` so a line total cannot be mistaken for a unit price.
      */}
      <ul className="space-y-1 border-b border-border pb-2">
        {summary.lines.map((line) => (
          <li key={line.slug} className="flex justify-between gap-4 text-ink-secondary">
            <span>
              {getProductBySlug(line.slug)?.name ?? line.slug}
              <span className="ml-1 text-ink-ghost tabular-nums">
                {line.quantity} × {formatMoney(money(line.unitPriceMinor), locale)}
              </span>
            </span>
            <span data-line-amount={line.lineTotalMinor} className="shrink-0 text-charcoal">
              {formatMoney(money(line.lineTotalMinor), locale)}
            </span>
          </li>
        ))}
      </ul>

      {/*
        The goods subtotal, only when there is more than one line to subtotal.
        With a single line it would restate the number directly above it, which
        reads as a second charge.
      */}
      {summary.lines.length > 1 && (
        <Row label={t('summary.goods')} minor={summary.goodsMinor} locale={locale} />
      )}
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
