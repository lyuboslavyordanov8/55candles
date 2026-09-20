/**
 * Money (AUDIT.md B-12).
 *
 * Two rules, both load-bearing:
 *
 * 1. **Amounts are integer minor units** — cents, never floats. `0.1 + 0.2`
 *    is `0.30000000000000004` in IEEE 754, and a shop that adds prices as
 *    floats eventually charges a cent too much or issues a фактура that does
 *    not reconcile. Every amount here is an integer and every operation
 *    preserves that.
 * 2. **Currency travels with the amount.** A bare number cannot be validated,
 *    so arithmetic across currencies throws rather than silently producing a
 *    meaningless total.
 *
 * Currency is EUR: Bulgaria adopted the euro on 2026-01-01 and the owner
 * confirmed EUR-only display. Whether a BGN dual-display obligation is still
 * in force is `[VERIFY]` — see §5 Q-14. If it turns out it is, the change is
 * confined to `formatMoney`: convert at the irrevocable statutory rate
 * (1 EUR = 1.95583 BGN, fixed by Council Regulation) and render both. Do not
 * store a second amount; a derived value that can drift from its source is a
 * reconciliation bug waiting to happen.
 */

import { defaultLocale } from '@/i18n/locales'

export const CURRENCY = 'EUR' as const

export type Currency = typeof CURRENCY

export interface Money {
  /** Integer minor units (cents). Never a float, never negative for a price. */
  readonly amountMinor: number
  readonly currency: Currency
}

/** Minor units per major unit. EUR has 2 decimal places. */
const MINOR_PER_MAJOR = 100

export class MoneyError extends Error {}

/** Construct money from integer minor units. */
export function money(amountMinor: number, currency: Currency = CURRENCY): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new MoneyError(
      `Money must be integer minor units, received ${amountMinor}. ` +
        'Use eur() if you have a decimal amount.'
    )
  }

  return { amountMinor, currency }
}

/**
 * Construct money from a major-unit amount, e.g. `eur(24.5)` → 2450 cents.
 *
 * Intended for authoring prices in a readable form. Rounds half away from
 * zero, which is what a human writing `24.005` means, and rejects an input
 * with more precision than the currency has so a typo cannot silently
 * truncate: `eur(24.999)` is far more likely to be a mistake than an intent.
 */
export function eur(major: number): Money {
  if (!Number.isFinite(major)) {
    throw new MoneyError(`Not a finite amount: ${major}`)
  }

  const scaled = major * MINOR_PER_MAJOR
  const rounded = Math.round(Math.abs(scaled)) * Math.sign(scaled)

  // Guard against a third decimal place, which cannot be represented.
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new MoneyError(
      `${major} has more precision than ${CURRENCY} can represent. ` +
        'Write the exact amount, or use money() with explicit minor units.'
    )
  }

  return money(rounded)
}

export const ZERO: Money = { amountMinor: 0, currency: CURRENCY }

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`Cannot combine ${a.currency} with ${b.currency}`)
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return money(a.amountMinor + b.amountMinor, a.currency)
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return money(a.amountMinor - b.amountMinor, a.currency)
}

/** Sum of any number of amounts. Empty sum is zero, not an error. */
export function sumMoney(amounts: readonly Money[]): Money {
  return amounts.reduce(addMoney, ZERO)
}

/**
 * Multiply by a whole quantity — a line total. Deliberately integer-only:
 * multiplying money by a fraction is a different operation (a discount or a
 * tax split) with its own rounding policy, and conflating them is how
 * rounding drift enters a ledger.
 */
export function multiplyMoney(amount: Money, quantity: number): Money {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyError(`Quantity must be a non-negative integer, received ${quantity}`)
  }

  return money(amount.amountMinor * quantity, amount.currency)
}

export function isZero(amount: Money): boolean {
  return amount.amountMinor === 0
}

export function compareMoney(a: Money, b: Money): number {
  assertSameCurrency(a, b)
  return a.amountMinor - b.amountMinor
}

/**
 * The locale reaching `formatMoney` is a URL segment, so it can be anything.
 *
 * `[locale]` is a single dynamic segment and the proxy skips any path with a
 * dot in it, so a request for a static file that does not exist —
 * `/apple-touch-icon.png`, say — is routed to the homepage with
 * `locale === 'apple-touch-icon.png'`. The locale layout calls `notFound()` for
 * that, and the visitor does get a 404, but layouts and pages render *in
 * parallel* in the App Router, so the page has already run: five product cards,
 * five `Intl.NumberFormat('apple-touch-icon.png')` calls, five
 * `RangeError: Incorrect locale information provided` in the log.
 *
 * `Intl` throws on any tag it cannot parse — `''`, `'null'`, `'x'`, `'bg_BG'`
 * with an underscore — so this is not a narrow case. A price is display text
 * and a malformed tag is a routing detail, so it falls back to the default
 * locale rather than taking the render down. Pages guard the segment as well
 * (see `app/[locale]/page.tsx`); this is the floor under all of them.
 */
function formattingLocale(locale: string): string {
  try {
    // Structural validation only, and the same parse `NumberFormat` does — it
    // throws RangeError on exactly the tags that would throw there.
    Intl.getCanonicalLocales(locale)
    return locale
  } catch {
    return defaultLocale
  }
}

/**
 * Format for display. `Intl.NumberFormat` places the symbol and chooses the
 * decimal separator per locale — Bulgarian writes `24,50 €`, English
 * `€24.50` — so neither is hardcoded.
 */
export function formatMoney(amount: Money, locale: string): string {
  return new Intl.NumberFormat(formattingLocale(locale), {
    style: 'currency',
    currency: amount.currency,
  }).format(amount.amountMinor / MINOR_PER_MAJOR)
}

/** Major-unit value, for the `price` field of `Offer` JSON-LD. */
export function toMajorUnits(amount: Money): string {
  return (amount.amountMinor / MINOR_PER_MAJOR).toFixed(2)
}
