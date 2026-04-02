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

  price?: {
    value: number
    currency: string
  }

  imagePath: string
  hoverImagePath?: string
}