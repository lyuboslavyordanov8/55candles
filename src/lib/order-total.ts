import {
  addMoney,
  money,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  ZERO,
  type Money,
} from './money'
import { getPricing } from '@/data/pricing'
import {
  billableWeight,
  codFeeFor,
  quote,
  type DeliveryOption,
  type ShippingQuote,
} from './shipping'
/**
 * Order totals (AUDIT.md B-03, Q-23).
 *
 * One place computes what the customer owes, on the server, from slugs and
 * quantities. The client never sends a price: a browser that can name its own
 * total can name zero. Prices are re-read from the catalogue here on every
 * calculation.
 *
 * Every component of the total is returned separately, because Bulgarian and
 * EU consumer law requires shipping and any COD fee to be shown as their own
 * line items before the customer confirms — a single opaque number is not
 * compliant, quite apart from being untrustworthy.
 *
 * There is no payment-method parameter: наложен платеж is the only method
 * (`src/lib/payments.ts`), so the COD fee applies to every order and asking the
 * caller which method to price would invite a total that does not match the one
 * the order is stored with. When a second method exists, this takes the method
 * back as an argument rather than growing a flag.
 */

export interface CartLine {
  slug: string
  quantity: number
}

export interface PricedLine {
  slug: string
  quantity: number
  unitPrice: Money
  lineTotal: Money
  weightGrams: number
}

export type OrderTotal =
  | {
      status: 'ok'
      lines: PricedLine[]
      goods: Money
      /**
       * A promo discount on the goods, or `null` when none applied (Q-37).
       *
       * Its own line rather than a reduced `goods`, because the customer agreed to
       * a price and a discount off it — and an invoice that shows only the net
       * figure cannot be reconciled against the price they were shown.
       */
      discount: Money | null
      /** The code that produced `discount`, in canonical form. */
      promoCode: string | null
      /** What the customer pays for delivery. Zero when `freeShipping`. */
      shipping: Money
      /**
       * The carriage the shop absorbed, present only on a free delivery. The
       * customer's total does not include it; the shop's costs do (Q-24).
       */
      shippingAbsorbed: Money | null
      /** Null when the merchant absorbs it (Q-23). */
      codFee: Money | null
      total: Money
      weightGrams: number
      /** Candles, summed across the lines — what the free-delivery rule counts. */
      itemCount: number
      freeShipping: boolean
    }
  | {
      status: 'incomplete'
      /** Slugs with no price or weight — blocks the order (B-03). */
      unpriced: string[]
      /** Present when pricing is fine but the tariff is not set (Q-22). */
      shippingQuote?: ShippingQuote
    }

export class CartError extends Error {}

/**
 * The goods half of an order: what is in the basket, and what the parcel weighs.
 *
 * Split out from `calculateTotal` because pricing the delivery now means asking
 * the courier, and the courier needs the weight — so the weight has to exist
 * before the quote does. Pure and cheap, so the caller computing it first and
 * `calculateTotal` computing it again costs nothing and keeps one definition of
 * what a basket weighs.
 */
export type CartPricing =
  | {
      status: 'ok'
      lines: PricedLine[]
      goods: Money
      weightGrams: number
      /** Candles, not lines: three of one scent is three candles (Q-24). */
      itemCount: number
    }
  | { status: 'incomplete'; unpriced: string[] }

/**
 * A rate the courier quoted for this exact parcel.
 *
 * Structurally the part of `ShipmentRate` (`src/lib/couriers/types.ts`) that
 * bears on the total. Declared here rather than imported so this module — pure
 * arithmetic, and the one place that decides what a customer owes — keeps no
 * dependency on the network layer.
 */
export interface CourierRate {
  delivery: Money
  codFee: Money
}

/**
 * A promo code the server has already accepted.
 *
 * Validated upstream by `src/lib/promo.ts` — this module is handed the amount,
 * not the code table, so the one place that decides what a customer owes stays
 * arithmetic and the one place that decides which codes exist stays server-only.
 */
export interface AppliedDiscount {
  /** Canonical code, for the summary line and the order record. */
  code: string
  amount: Money
}

export function priceCart(lines: readonly CartLine[]): CartPricing {
  if (lines.length === 0) {
    throw new CartError('Cannot total an empty cart')
  }

  const unpriced: string[] = []
  const priced: PricedLine[] = []

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new CartError(`Invalid quantity ${line.quantity} for ${line.slug}`)
    }

    const entry = getPricing(line.slug)

    if (!entry || entry.packedWeightGrams <= 0) {
      unpriced.push(line.slug)
      continue
    }

    priced.push({
      slug: line.slug,
      quantity: line.quantity,
      unitPrice: entry.price,
      lineTotal: multiplyMoney(entry.price, line.quantity),
      weightGrams: entry.packedWeightGrams * line.quantity,
    })
  }

  if (unpriced.length > 0) {
    return { status: 'incomplete', unpriced }
  }

  return {
    status: 'ok',
    lines: priced,
    goods: sumMoney(priced.map((line) => line.lineTotal)),
    weightGrams: billableWeight(priced.map((line) => line.weightGrams)),
    itemCount: priced.reduce((count, line) => count + line.quantity, 0),
  }
}

/**
 * Compute the total.
 *
 * Returns `incomplete` rather than throwing when a price or tariff is missing,
 * because that is the *expected* state until the owner supplies the numbers,
 * and the checkout must render it as "not yet available" rather than crash.
 * Genuinely invalid input — a negative quantity, an unknown slug — throws,
 * since it can only be a bug or tampering.
 *
 * `rate` is the courier's own price for this parcel, where one could be
 * obtained. Omitted, the static card in `shipping.ts` is used — see
 * `src/lib/shipping-rates.ts` for which happens when, and why a *failed* live
 * quote is not allowed to reach this function at all.
 *
 * `discount` is a promo code the server has already accepted (Q-37). It comes off
 * the goods only, and is clamped to them here: the delivery charge and the наложен
 * платеж fee are the courier's money, so no code may reduce them, and no total may
 * go negative however generous a code is against a small basket.
 */
export function calculateTotal(
  lines: readonly CartLine[],
  delivery: DeliveryOption,
  rate?: CourierRate,
  discount?: AppliedDiscount
): OrderTotal {
  const cart = priceCart(lines)

  if (cart.status === 'incomplete') {
    return { status: 'incomplete', unpriced: cart.unpriced }
  }

  const { lines: priced, goods, weightGrams, itemCount } = cart
  const shippingQuote = quote(delivery, weightGrams, { goods, itemCount }, rate?.delivery)

  if (shippingQuote.status !== 'quoted') {
    return { status: 'incomplete', unpriced: [], shippingQuote }
  }

  const codFee = codFeeFor(delivery, rate?.codFee)
  const applied = clampDiscount(discount, goods)

  return {
    status: 'ok',
    lines: priced,
    goods,
    discount: applied?.amount ?? null,
    promoCode: applied?.code ?? null,
    shipping: shippingQuote.price,
    // Only interesting when the customer did not pay it.
    shippingAbsorbed: shippingQuote.free ? shippingQuote.listPrice : null,
    codFee,
    total: addMoney(
      addMoney(subtractMoney(goods, applied?.amount ?? ZERO), shippingQuote.price),
      codFee ?? ZERO
    ),
    weightGrams,
    itemCount,
    freeShipping: shippingQuote.free,
  }
}

/**
 * The discount as it may actually be taken off this basket, or `null`.
 *
 * Three things are refused rather than trusted, because this is the last point
 * before a total: a discount larger than the goods (clamped, not rejected — the
 * customer keeps what the code is worth up to a free basket), a zero one (dropped,
 * so the summary does not show a `− 0,00 €` line), and a negative one (dropped;
 * only a bug could produce it, and a surcharge dressed as a discount is the worst
 * possible way to find out).
 */
function clampDiscount(
  discount: AppliedDiscount | undefined,
  goods: Money
): AppliedDiscount | null {
  if (!discount || discount.amount.amountMinor <= 0) return null

  const capped = Math.min(discount.amount.amountMinor, goods.amountMinor)

  if (capped <= 0) return null

  return { code: discount.code, amount: money(capped, goods.currency) }
}
