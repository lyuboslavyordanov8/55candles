/**
 * The ingredients a candle can be made of, as translation keys.
 *
 * Every entry needs wording under `product.ingredient.<key>` in **both**
 * message catalogues; `src/data/__tests__/product-copy.test.ts` fails if one is
 * missing. Keys rather than text because the list used to be English prose in
 * the data, so Bulgarian customers read "Soy wax, Cotton wick" on the one page
 * where the law expects their own language (AUDIT.md B-22).
 */
export const INGREDIENT_KEYS = ['soyWax', 'cottonWick', 'fragranceOil', 'waxDetail'] as const

export type IngredientKey = (typeof INGREDIENT_KEYS)[number]

/**
 * A candle, minus its prose.
 *
 * **No translatable text lives on this type** beyond `name`, which is the same
 * wordmark in both languages. The mood, descriptor, description and scent notes
 * are in `product.copy.<slug>` in `messages/bg.json` and `messages/en.json`;
 * the ingredient list here is keys into `product.ingredient.*`. Adding a
 * candle therefore means adding its copy to both catalogues — the test named
 * above is what tells you, rather than a Bulgarian visitor.
 */
export type Product = {
  slug: string
  scent: string
  /** The wordmark on the tin. Not translated: it reads the same in both. */
  name: string

  /**
   * What the candle is made of, in the order shown.
   *
   * Keys, not text — see `INGREDIENT_KEYS`. A candle that differs from the
   * standard four lists its own.
   */
  ingredients: readonly IngredientKey[]

  accentColor: string
  glowColor?: string

  emoji: string

  seasonal: null | { active: boolean }

  /**
   * Social proof for the product cards.
   *
   * **These are placeholders.** They are hand-written in `src/data/products.ts`
   * and nothing computes them, because there is no reviews table yet. Edit them
   * there. When real reviews land they should be derived from that data and
   * these two fields deleted, not kept in sync by hand.
   *
   * Both are optional: a product with neither renders no stars at all rather
   * than an invented zero.
   */
  rating?: number
  reviewCount?: number

  /**
   * Optional corner badge on the product card.
   *
   * This is a **translation key**, not display text: the card renders it as
   * `collection.badge.<value>`, so add the Bulgarian and English wording to
   * both message catalogues when introducing a new one.
   *
   * Only one candle should carry `bestseller` at a time — it is a claim about
   * the shop, not a decoration.
   *
   * Rendered on a pastel chip — never a dark or black one.
   */
  badge?: 'new' | 'bestseller'

  /**
   * Price deliberately does NOT live here.
   *
   * It needs integer minor units and a currency (AUDIT.md B-12), and a second
   * optional field on this type would be a competing source of truth that
   * silently wins or loses depending on which the caller reads. Prices and
   * packed weights are in `src/data/pricing.ts`, keyed by slug.
   */

  /** The primary image, and the one used wherever a single image is shown. */
  imagePath: string
  hoverImagePath?: string

  /**
   * `imagePath`'s real pixel dimensions, measured from the file (`sharp(...).metadata()`,
   * not eyeballed). Every `<Image>` using this photo renders with `fill`, so
   * these are unused there — they exist for the one place that needs a
   * *declared* size without decoding the file itself: the product page's
   * `openGraph.images`, where a scraper otherwise has to fetch the photo
   * before it can lay out a preview. See the homepage's `homeBanner` for the
   * same pattern applied to the hero image.
   */
  imageWidth: number
  imageHeight: number

  /**
   * Further photographs, in the order they should appear after `imagePath`.
   *
   * Use `productImages()` in `src/data/products.ts` rather than reading this
   * directly — it prepends `imagePath` and de-duplicates, so callers get one
   * ordered list and cannot accidentally show the primary image twice.
   *
   * A product with none of these renders a single static image: the gallery
   * hides its own controls rather than showing a strip of one thumbnail —
   * Winter Wonderland at present, until it is photographed. The rest carry three studio shots of the closed tin (front,
   * side, tilted), square-cropped from the 2026-09 shoot; the primary image
   * stays the lit-candle illustration.
   */
  extraImages?: string[]
}