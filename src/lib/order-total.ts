import { addMoney, multiplyMoney, sumMoney, ZERO, type Money } from './money'
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
      shipping: Money
      /** Null when the merchant absorbs it (Q-23). */
      codFee: Money | null
      total: Money
      weightGrams: number
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
 * Compute the total.
 *
 * Returns `incomplete` rather than throwing when a price or tariff is missing,
 * because that is the *expected* state until the owner supplies the numbers,
 * and the checkout must render it as "not yet available" rather than crash.
 * Genuinely invalid input — a negative quantity, an unknown slug — throws,
 * since it can only be a bug or tampering.
 */
export function calculateTotal(
  lines: readonly CartLine[],
  delivery: DeliveryOption
): OrderTotal {
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

  const goods = sumMoney(priced.map((line) => line.lineTotal))
  const weightGrams = billableWeight(priced.map((line) => line.weightGrams))
  const shippingQuote = quote(delivery, weightGrams, goods)

  if (shippingQuote.status !== 'quoted') {
    return { status: 'incomplete', unpriced: [], shippingQuote }
  }

  const codFee = codFeeFor(delivery)

  return {
    status: 'ok',
    lines: priced,
    goods,
    shipping: shippingQuote.price,
    codFee,
    total: addMoney(addMoney(goods, shippingQuote.price), codFee ?? ZERO),
    weightGrams,
    freeShipping: shippingQuote.free,
  }
}
