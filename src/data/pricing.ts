import { eur, type Money } from '@/lib/money'
import { products } from './products'

/**
 * Price and packed weight per product (AUDIT.md B-03, Q-11, Q-12).
 *
 * **This table is deliberately empty.** The owner has not supplied prices or
 * weights, and both are facts about the business that cannot be inferred: a
 * guessed price is a wrong price, and a guessed weight produces a shipping
 * quote that undercharges on every order. The machinery around it is complete
 * and tested, so filling one row here prices a product end to end.
 *
 * To price a product, add an entry keyed by its slug:
 *
 * ```ts
 * cherry: { price: eur(24.5), packedWeightGrams: 520 },
 * ```
 *
 * - `price` — what the customer pays, **VAT inclusive** (Q-13: consumer-facing
 *   prices normally are; confirm with your accountant). Author it with `eur()`
 *   in major units for readability; it is stored as integer cents.
 * - `packedWeightGrams` — the *packed* weight: candle, jar, box and filler, as
 *   the courier will weigh it. Not the net wax weight. Both Econt and Speedy
 *   bill on this, so a value that is too low means you absorb the difference
 *   on every parcel.
 *
 * Anything absent from this table is unpurchasable by construction — see
 * `isPurchasable`. That is the safe default: a product with no price cannot be
 * added to a cart, so no order can be placed at a price nobody set.
 */
export interface ProductPricing {
  price: Money
  packedWeightGrams: number
}

export const pricing: Partial<Record<string, ProductPricing>> = {
  // [TODO: Q-11 / Q-12 — price and packed weight per scent.]
  // Every product is listed here commented out rather than omitted, so the
  // set of things awaiting a number is visible rather than implied:
  //
  // cherry:             { price: eur(0), packedWeightGrams: 0 },
  // orange:             { price: eur(0), packedWeightGrams: 0 },
  // strawberry:         { price: eur(0), packedWeightGrams: 0 },
  // vanilla:            { price: eur(0), packedWeightGrams: 0 },
  // espresso-martini:   { price: eur(0), packedWeightGrams: 0 },
  // winter-wonderland:  { price: eur(0), packedWeightGrams: 0 },
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
