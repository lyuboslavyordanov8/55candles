export type Product = {
  slug: string
  scent: string
  name: string

  // ✨ More expressive, but still guided
  mood:
  | 'Playful'
  | 'Bright'
  | 'Comforting'
  | 'Juicy'
  | 'Deep'
  | 'Seasonal'
  | string // fallback for future expansion

  descriptor: string
  description: string

  scentNotes: {
    top: string
    heart: string
    base: string
  }

  ingredients: string[]

  accentColor: string
  glowColor?: string

  emoji: string

  // ✨ Brand-first, not ecommerce-first
  highlight?:
  | 'Signature'
  | 'Just added'
  | 'Limited release'
  | 'Evening favourite'
  | string // allow custom labels

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
   * both message catalogues when introducing a new one. `highlight` above is
   * the older, untranslated field and is why the badge is not just a string.
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
   * Further photographs, in the order they should appear after `imagePath`.
   *
   * Use `productImages()` in `src/data/products.ts` rather than reading this
   * directly — it prepends `imagePath` and de-duplicates, so callers get one
   * ordered list and cannot accidentally show the primary image twice.
   *
   * A product with none of these renders a single static image: the gallery
   * hides its own controls rather than showing a strip of one thumbnail.
   */
  extraImages?: string[]
}