import 'server-only'

import { money, type Money } from './money'

/**
 * Promo codes (AUDIT.md Q-37, N-11).
 *
 * `import 'server-only'` is the point of this file, not a formality. The table
 * below is the complete list of codes that work, so a client component importing
 * anything from here would ship every unpublished code — value, minimum and
 * expiry — inside the browser bundle, where it is one "view source" away from
 * being published. The checkout page reads `promoCodesConfigured()` on the server
 * and hands the form a boolean; the form never sees a code it was not given.
 *
 * Two further decisions worth knowing before editing:
 *
 * 1. **A discount applies to the goods, never to the delivery or the наложен
 *    платеж fee.** Those are amounts the courier charges us; discounting them
 *    would be a discount on somebody else's invoice, and `FREE_DELIVERY_FROM_ITEMS`
 *    in `shipping.ts` is the deliberate, separate decision to absorb the carriage.
 * 2. **Nothing here trusts the customer's arithmetic, and nothing here refuses an
 *    order.** A code that does not exist, has expired or has not met its minimum
 *    produces a message beside the field and a total without it — never an error
 *    the customer cannot act on and never a silently ignored code, which is the
 *    version they would report as "your discount does not work".
 */

export type PromoKind = 'percent' | 'amount'

export interface PromoCode {
  /**
   * Canonical form: upper case, no spaces. What the customer types is put
   * through `normalisePromoCode` before it is compared, so they may type
   * `welcome 10` and still match `WELCOME10`.
   */
  code: string
  kind: PromoKind
  /** Whole percent for `percent`; integer minor units for `amount`. */
  value: number
  /**
   * Smallest goods total the code applies to, in minor units. Absent means no
   * minimum. Judged on the goods alone — adding the delivery charge to the test
   * would make the same basket qualify or not depending on which office the
   * customer picked.
   */
  minGoodsMinor?: number
  /**
   * Last day the code works, inclusive, as `YYYY-MM-DD` in Bulgarian local time.
   * Absent means it does not expire.
   */
  lastDay?: string
}

/**
 * The codes that work. **Live the moment this deploys.**
 *
 * [TODO: Q-37 — the owner's own codes, values and end dates.] The one below
 * exists so the field is a real feature rather than an untested mechanism: it is
 * a 10% discount anybody who guesses the string can use, so replace or delete it
 * before it is worth guessing.
 *
 * ```ts
 * { code: 'KOLEDA25', kind: 'percent', value: 15, minGoodsMinor: 4000, lastDay: '2026-12-31' },
 * { code: 'PARVA5',   kind: 'amount',  value: 500 },  // 5,00 EUR off
 * ```
 *
 * Mutable, like `tariffs` and `pricing`, so that tests can install their own
 * codes and restore the real ones afterwards — a percentage, a minimum and an
 * expiry cannot be exercised against a table nobody can substitute. Nothing in
 * the application writes to it.
 */
export const PROMO_CODES: PromoCode[] = [
  { code: '55CANDLES10', kind: 'percent', value: 10 },
]

/**
 * Longest code accepted from the form.
 *
 * Not a validation rule — no real code is near it. It is here so a request that
 * posts a megabyte into the field cannot make the echoed response a megabyte too.
 */
export const PROMO_CODE_MAX = 40

export type PromoOutcome =
  /** Nothing was entered. Not a failure, and nothing to report. */
  | { status: 'none' }
  | { status: 'applied'; code: string; discount: Money }
  | { status: 'unknown'; code: string }
  | { status: 'expired'; code: string }
  | { status: 'belowMinimum'; code: string; minGoods: Money }

export class PromoError extends Error {}

/** True while at least one code exists, so the field is worth showing. */
export function promoCodesConfigured(): boolean {
  return PROMO_CODES.length > 0
}

/**
 * What the customer typed, in the form the table is written in.
 *
 * Case and inner spaces are dropped because a code is read off a screenshot or
 * an Instagram story and typed by hand — `Welcome 10` is the same intent as
 * `WELCOME10`, and rejecting it teaches the customer that the shop is broken.
 */
export function normalisePromoCode(entered: string): string {
  return entered.replace(/\s+/g, '').toUpperCase().slice(0, PROMO_CODE_MAX)
}

/**
 * Validate a table entry, at the point of use.
 *
 * Same reasoning as `assertValidTariff`: a malformed entry must fail loudly
 * rather than produce a plausible-looking wrong discount. A 110% code would
 * otherwise hand out money.
 */
export function assertValidPromoCode(entry: PromoCode): void {
  if (entry.code !== normalisePromoCode(entry.code) || entry.code === '') {
    throw new PromoError(`Promo code must be written canonically: ${JSON.stringify(entry.code)}`)
  }

  if (!Number.isInteger(entry.value) || entry.value <= 0) {
    throw new PromoError(`${entry.code}: value must be a positive integer, got ${entry.value}`)
  }

  if (entry.kind === 'percent' && entry.value > 100) {
    throw new PromoError(`${entry.code}: ${entry.value}% is more than the whole order`)
  }

  if (entry.lastDay !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(entry.lastDay)) {
    throw new PromoError(`${entry.code}: lastDay must be YYYY-MM-DD, got ${entry.lastDay}`)
  }
}

/**
 * Today's date in Bulgaria, as `YYYY-MM-DD`.
 *
 * Formatted in the shop's own time zone rather than the server's: Vercel runs in
 * UTC, so a code ending on the 31st would stop working at 03:00 on the 31st for a
 * customer in Sofia — during the two hours the shop is most likely to be
 * advertising it. `en-CA` is used only because it is the locale whose short date
 * format *is* ISO, which keeps the comparison a string comparison.
 */
function todayInSofia(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Work out what a code is worth against a goods total.
 *
 * `goods` is the goods subtotal *before* any discount — the only defensible
 * base, since a percentage of a discounted total would depend on the order the
 * codes were applied in.
 *
 * The discount is clamped to the goods total: a 20,00 EUR code against a
 * 19,99 EUR basket takes the price to zero and stops there, rather than becoming
 * a credit against the delivery charge or a negative total.
 */
export function evaluatePromoCode(
  entered: string,
  goods: Money,
  now: Date = new Date()
): PromoOutcome {
  const code = normalisePromoCode(entered)

  if (!code) return { status: 'none' }

  const entry = PROMO_CODES.find((candidate) => candidate.code === code)

  // Deliberately the same answer for "no such code" and "a code that was never
  // meant for this customer": the field must not become an oracle for guessing
  // codes that exist.
  if (!entry) return { status: 'unknown', code }

  assertValidPromoCode(entry)

  if (entry.lastDay && todayInSofia(now) > entry.lastDay) {
    // Named as expired rather than unknown, because the customer did read it
    // somewhere and telling them it never existed invites a support message.
    return { status: 'expired', code }
  }

  if (entry.minGoodsMinor !== undefined && goods.amountMinor < entry.minGoodsMinor) {
    return {
      status: 'belowMinimum',
      code,
      minGoods: money(entry.minGoodsMinor, goods.currency),
    }
  }

  const raw =
    entry.kind === 'percent'
      ? Math.round((goods.amountMinor * entry.value) / 100)
      : entry.value

  const discount = Math.min(raw, goods.amountMinor)

  // A code worth nothing against this basket — a 10% discount on a free sample —
  // is reported as applied with a zero discount rather than as a failure. The
  // customer entered a valid code; there is simply nothing for it to take off.
  return { status: 'applied', code, discount: money(discount, goods.currency) }
}
