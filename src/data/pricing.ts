import { eur, type Money } from '@/lib/money'
import { products } from './products'

/**
 * Price and packed weight per product (AUDIT.md B-03, Q-11, Q-12).
 *
 * **The prices here are the owner's real figure; the weights are placeholders.**
 * On 2026-08-06 the owner set every candle to 19,99 EUR in order to exercise the
 * order flow end to end. No weight was supplied, and `calculateTotal` refuses to
 * price an order without one, so `PLACEHOLDER_WEIGHT_GRAMS` below stands in.
 *
 * That is why `PRICING_IS_PROVISIONAL` exists. While it is `true` the site says
 * so on the product page and at checkout, exactly as `LEGAL_IS_DRAFT` does for
 * the legal pages. Clear the flag when the weights are real — a test fails if
 * you clear it while the placeholder is still in use, so it cannot be forgotten.
 *
 * To finish this table:
 *
 * ```ts
 * cherry: { price: eur(19.99), packedWeightGrams: 520 },
 * ```
 *
 * - `price` — what the customer pays, **VAT inclusive** (Q-13: consumer-facing
 *   prices normally are; confirm with your accountant). Author it with `eur()`
 *   in major units for readability; it is stored as integer cents.
 * - `packedWeightGrams` — the *packed* weight: candle, jar, box and filler, as
 *   the courier will weigh it. Not the net wax weight. Both Econt and Speedy
 *   bill on this, so a value that is too low means you absorb the difference on
 *   every parcel. Weigh one finished, boxed candle on a kitchen scale.
 *
 * Anything absent from this table is unpurchasable by construction — see
 * `isPurchasable`. That is the safe default: a product with no price cannot be
 * added to a cart, so no order can be placed at a price nobody set.
 */
export interface ProductPricing {
  price: Money
  packedWeightGrams: number
}

/**
 * Owner's price as of 2026-08-06, applied uniformly. Real, not a placeholder —
 * but "the same for every scent" is itself a decision worth revisiting once the
 * seasonal and larger formats exist.
 */
export const UNIFORM_PRICE: Money = eur(19.99)

/**
 * Stand-in packed weight (Q-12 unanswered).
 *
 * 500 g is a plausible boxed 180–200 ml glass candle, chosen so shipping bands
 * behave realistically during testing. It is **not measured**, and every gram
 * of error is money lost on every parcel, so it must not survive to launch.
 */
export const PLACEHOLDER_WEIGHT_GRAMS = 500

/**
 * True while any figure in this table is a stand-in rather than a real
 * measurement. Drives the visible notices; see the module comment.
 */
export const PRICING_IS_PROVISIONAL = true

export const pricing: Partial<Record<string, ProductPricing>> = {
  cherry: { price: UNIFORM_PRICE, packedWeightGrams: PLACEHOLDER_WEIGHT_GRAMS },
  orange: { price: UNIFORM_PRICE, packedWeightGrams: PLACEHOLDER_WEIGHT_GRAMS },
  strawberry: { price: UNIFORM_PRICE, packedWeightGrams: PLACEHOLDER_WEIGHT_GRAMS },
  vanilla: { price: UNIFORM_PRICE, packedWeightGrams: PLACEHOLDER_WEIGHT_GRAMS },
  'espresso-martini': { price: UNIFORM_PRICE, packedWeightGrams: PLACEHOLDER_WEIGHT_GRAMS },
  // Priced like the rest, but still unpurchasable: it is out of season, and
  // `isPurchasable` checks that independently of pricing.
  'winter-wonderland': { price: UNIFORM_PRICE, packedWeightGrams: PLACEHOLDER_WEIGHT_GRAMS },
}

/** Referenced so the `eur` import documents the intended authoring style. */
export const PRICING_EXAMPLE: ProductPricing = {
  price: eur(24.5),
  packedWeightGrams: 520,
}

export function getPricing(slug: string): ProductPricing | undefined {
  return pricing[slug]
}

/**
 * Whether a product can be bought right now.
 *
 * Requires a price *and* a weight: a priced product with no weight would reach
 * checkout and fail there, having already taken the customer's time. Better to
 * present it as not-yet-available on the product page.
 *
 * Seasonal products that are out of season are excluded regardless of pricing.
 */
export function isPurchasable(slug: string): boolean {
  const entry = pricing[slug]
  if (!entry || entry.packedWeightGrams <= 0) return false

  const product = products.find((p) => p.slug === slug)
  if (!product) return false
  if (product.seasonal !== null && !product.seasonal.active) return false

  return true
}

/** Slugs still waiting on a number, for the launch checklist and tests. */
export function unpricedSlugs(): string[] {
  return products.filter((p) => !pricing[p.slug]).map((p) => p.slug)
}

export const isCatalogueFullyPriced = () => unpricedSlugs().length === 0

/**
 * Slugs still carrying the stand-in weight, for the launch checklist.
 *
 * Compares against `PLACEHOLDER_WEIGHT_GRAMS` rather than trusting the flag, so
 * a real 500 g measurement is indistinguishable from the placeholder — that is
 * deliberate, and the cost is one product to re-check rather than a wrong
 * shipping charge shipped to production.
 */
export function provisionallyWeighedSlugs(): string[] {
  return products
    .filter((p) => pricing[p.slug]?.packedWeightGrams === PLACEHOLDER_WEIGHT_GRAMS)
    .map((p) => p.slug)
}
