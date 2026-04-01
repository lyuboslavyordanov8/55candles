export type Scent =
  | 'cherry'
  | 'orange'
  | 'vanilla'
  | 'strawberry'
  | 'espresso-martini'
  | 'winter-wonderland'

export interface ScentNotes {
  top: string
  heart: string
  base: string
}

export interface Product {
  id: string
  slug: string
  scent: Scent
  name: string
  descriptor: string      // e.g. "Sweet & fruity · Cherry wax top"
  description: string
  scentNotes: ScentNotes
  ingredients: string[]
  accentColor: string     // hex — matches tailwind scent colors
  emoji: string
  seasonal: { active: boolean } | null  // null = year-round; developer toggles active manually
  price: number | null    // null until payments are enabled
  imagePath: string       // relative to /public, e.g. "/images/products/cherry.jpg"
}
