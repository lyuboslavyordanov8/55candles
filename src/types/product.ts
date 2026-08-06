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
   * Price deliberately does NOT live here.
   *
   * It needs integer minor units and a currency (AUDIT.md B-12), and a second
   * optional field on this type would be a competing source of truth that
   * silently wins or loses depending on which the caller reads. Prices and
   * packed weights are in `src/data/pricing.ts`, keyed by slug.
   */

  imagePath: string
  hoverImagePath?: string
}