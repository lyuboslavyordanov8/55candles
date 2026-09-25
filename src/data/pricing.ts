import { eur, type Money } from '@/lib/money'
import { products } from './products'

/**
 * Price and packed weight per product (AUDIT.md B-03, Q-11, Q-12).
 *
 * **Both figures in this table are now the owner's real numbers.** 19,99 EUR
 * per candle (2026-08-06) and 250 g per finished candle (2026-08-10), so
 * `PRICING_IS_PROVISIONAL` is `false`.
 *
 * The courier tariffs are a separate table and are *still* placeholders, so
 * checkout continues to show its "delivery cost is illustrative" notice — that
 * banner is gated on `PRICING_IS_PROVISIONAL || TARIFFS_ARE_PLACEHOLDER`.
 *
 * To extend this table:
 *
 * ```ts
 * cherry: { price: eur(19.99), packedWeightGrams: 250 },
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
 * Owner's price as of 2026-08-06 for the year-round range (the winter edition
 * has its own). Real, not a placeholder —
 * but "the same for every scent" is itself a decision worth revisiting once the
 * seasonal and larger formats exist.
 */
export const UNIFORM_PRICE: Money = eur(19.99)

/**
 * Weight of one finished candle, owner-supplied on 2026-08-10 (Q-12 answered).
 *
 * This is the whole candle — wax and jar — as it leaves the workshop. It is
 * the *item* weight, not the parcel weight: `billableWeight()` adds
 * `PACKAGING_WEIGHT_GRAMS` for the outer carton on top, so a single-candle
 * order bills 250 + 150 = 400 g.
 *
 * Uniform across all six scents. Give a scent its own figure here if that
 * stops being true.
 */
export const CANDLE_WEIGHT_GRAMS = 250

/**
 * Retained so the test that guards against stand-in weights has something to
 * compare against. Nothing in `pricing` uses it any more; if a new product is
 * added with this value, `provisionallyWeighedSlugs()` will catch it.
 */
export const PLACEHOLDER_WEIGHT_GRAMS = 500

/**
 * True while any figure in this table is a stand-in rather than a real
 * measurement. Drives the visible notices; see the module comment.
 *
 * Now false: both the price and the weight are the owner's real figures.
 * Note this does *not* clear the checkout notice on its own — that is gated on
 * `PRICING_IS_PROVISIONAL || TARIFFS_ARE_PLACEHOLDER`, and the courier rate
 * cards are still placeholders (Q-22).
 */
export const PRICING_IS_PROVISIONAL = false

export const pricing: Partial<Record<string, ProductPricing>> = {
  cherry: { price: UNIFORM_PRICE, packedWeightGrams: CANDLE_WEIGHT_GRAMS },
  orange: { price: UNIFORM_PRICE, packedWeightGrams: CANDLE_WEIGHT_GRAMS },
  strawberry: { price: UNIFORM_PRICE, packedWeightGrams: CANDLE_WEIGHT_GRAMS },
  vanilla: { price: UNIFORM_PRICE, packedWeightGrams: CANDLE_WEIGHT_GRAMS },
  'espresso-martini': { price: UNIFORM_PRICE, packedWeightGrams: CANDLE_WEIGHT_GRAMS },
  // The owner's price for the winter edition (2026-09-25). Only buyable while
  // in season — `isPurchasable` checks that independently of pricing.
  'winter-wonderland': { price: eur(22), packedWeightGrams: CANDLE_WEIGHT_GRAMS },
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
