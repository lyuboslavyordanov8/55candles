import type { Product } from '@/types/product'

export const products: Product[] = [
  {
    slug: 'cherry',
    scent: 'cherry',
    name: 'Electric Cherry',
    mood: 'Playful',

    descriptor: 'Sweet, ripe cherry',
    description:
      'A warm, playful cherry scent — rich and juicy, like late summer. Finished with a sculpted cherry detail that feels almost too perfect to light.',

    scentNotes: {
      top: 'Cherry, Raspberry',
      heart: 'Rose, Jasmine',
      base: 'Musk, Sandalwood',
    },

    ingredients: [
      'Soy wax',
      'Cotton wick',
      'Phthalate-free fragrance oil',
      'Hand-finished wax detail',
    ],

    accentColor: '#e83a3a',
    glowColor: 'rgba(232,58,58,0.25)',

    emoji: '🍒',

    highlight: 'Signature',

    seasonal: null,

    rating: 4.9,
    reviewCount: 42,
    badge: 'bestseller',

    imagePath: '/images/products/electric-cherry.webp',
    extraImages: ['/images/products/cherry-tin.webp'],
  },

  {
    slug: 'orange',
    scent: 'orange',
    name: 'Sweet Orange',
    mood: 'Bright',

    descriptor: 'Fresh citrus peel',
    description:
      'Clean, bright citrus with a soft floral edge. Uplifting and effortless — like sunlight through an open window.',

    scentNotes: {
      top: 'Orange, Bergamot',
      heart: 'White Tea, Neroli',
      base: 'Cedarwood, Musk',
    },

    ingredients: [
      'Soy wax',
      'Cotton wick',
      'Phthalate-free fragrance oil',
      'Hand-finished wax detail',
    ],

    accentColor: '#f07020',
    glowColor: 'rgba(240,112,32,0.25)',

    emoji: '🍊',

    highlight: 'Just added',

    seasonal: null,

    rating: 4.8,
    reviewCount: 31,
    badge: 'new',

    imagePath: '/images/products/sweet-orange.webp',
    extraImages: ['/images/products/orange-tin.webp'],
  },

  {
    slug: 'vanilla',
    scent: 'vanilla',
    name: 'Vanilla Egg',
    mood: 'Comforting',

    descriptor: 'Soft vanilla cream',
    description:
      'Warm, smooth, and quietly indulgent. A comforting vanilla that settles into the space without ever overwhelming it.',

    scentNotes: {
      top: 'Vanilla Pod, Caramel',
      heart: 'Tonka Bean, Amber',
      base: 'Musk, Sandalwood',
    },

    ingredients: [
      'Soy wax',
      'Cotton wick',
      'Phthalate-free fragrance oil',
      'Hand-finished wax detail',
    ],

    accentColor: '#c8a040',
    glowColor: 'rgba(200,160,64,0.25)',

    emoji: '🍦',

    highlight: 'Signature',

    seasonal: null,

    rating: 5.0,
    reviewCount: 27,

    imagePath: '/images/products/vanilla-egg.webp',
    extraImages: ['/images/products/vanilla-tin.webp'],
  },

  {
    slug: 'strawberry',
    scent: 'strawberry',
    name: 'Strawberry Cake',
    mood: 'Juicy',

    descriptor: 'Fresh garden strawberry',
    description:
      'Bright and juicy with a soft sweetness. Fresh-picked and vibrant, with a playful finish that lifts any space.',

    scentNotes: {
      top: 'Strawberry, Peach',
      heart: 'Jasmine, Violet',
      base: 'Musk, Light Wood',
    },

    ingredients: [
      'Soy wax',
      'Cotton wick',
      'Phthalate-free fragrance oil',
      'Hand-finished wax detail',
    ],

    accentColor: '#e8408a',
    glowColor: 'rgba(232,64,138,0.25)',

    emoji: '🍓',

    highlight: 'Just added',

    seasonal: null,

    rating: 4.9,
    reviewCount: 36,
    badge: 'new',

    imagePath: '/images/products/strawberry-cake.webp',
    extraImages: ['/images/products/strawberry-tin.webp'],
  },

  {
    slug: 'espresso-martini',
    scent: 'espresso-martini',
    name: 'Espresso Martini',
    mood: 'Deep',

    descriptor: 'Dark espresso blend',
    description:
      'Rich espresso layered with soft vanilla and amber. Bold, smooth, and quietly indulgent — made for slower evenings.',

    scentNotes: {
      top: 'Espresso, Dark Chocolate',
      heart: 'Vanilla, Tonka Bean',
      base: 'Amber, Musk',
    },

    ingredients: [
      'Soy wax',
      'Cotton wick',
      'Phthalate-free fragrance oil',
      'Hand-finished wax detail',
    ],

    accentColor: '#4a2a18',
    glowColor: 'rgba(74,42,24,0.25)',

    emoji: '🍸',

    highlight: 'Evening favourite',

    seasonal: null,

    rating: 4.7,
    reviewCount: 19,

    imagePath: '/images/products/espresso-martini.webp',
    extraImages: ['/images/products/espresso-martini-tin.webp'],
  },

  {
    slug: 'winter-wonderland',
    scent: 'winter-wonderland',
    name: 'Winter Wonderland',
    mood: 'Seasonal',

    descriptor: 'Crisp pine & spice',
    description:
      'A winter blend of pine, spice, and soft vanilla. Cool, comforting, and only here for a short time.',

    scentNotes: {
      top: 'Pine, Eucalyptus',
      heart: 'Cinnamon, Clove',
      base: 'Vanilla, Amber',
    },

    ingredients: [
      'Soy wax',
      'Cotton wick',
      'Phthalate-free fragrance oil',
      'Hand-finished wax detail',
    ],

    accentColor: '#7a9ab8',
    glowColor: 'rgba(122,154,184,0.25)',

    emoji: '❄️',

    highlight: 'Limited release',

    seasonal: { active: false },

    imagePath: '/images/products/winter-wonderland.webp',
  },
]

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug)
}

/**
 * Every image for a product, primary first.
 *
 * The single place that decides gallery order, so the card, the detail page and
 * any future lightbox cannot disagree about which photo comes first.
 * De-duplicated, because listing the primary image again under `extraImages` is
 * an easy mistake that would render the same photo twice in the strip.
 */
export function productImages(product: Product): string[] {
  return [...new Set([product.imagePath, ...(product.extraImages ?? [])])]
}

/**
 * Which candles the homepage grid shows, in the order it shows them.
 *
 * **This is the list to edit to change the homepage grid.** It is deliberately
 * separate from `products`: the catalogue holds everything we sell, this holds
 * the five we lead with. Winter Wonderland is absent because it is out of
 * season — it still appears on `/products` with its seasonal overlay.
 *
 * Note these are slugs, not display names. The slugs are load-bearing: they key
 * `pricing.ts`, the cart URL parameters and the product routes, so renaming a
 * candle means editing its `name` above, never its `slug`.
 */
export const HOMEPAGE_PRODUCT_SLUGS = [
  'vanilla',
  'orange',
  'strawberry',
  'espresso-martini',
  'cherry',
] as const

/** The homepage grid's products, resolved and ordered. */
export function homepageProducts(): Product[] {
  return HOMEPAGE_PRODUCT_SLUGS.map((slug) => {
    const product = getProductBySlug(slug)
    if (!product) {
      // A typo here would silently drop a card from the homepage, which is the
      // kind of thing nobody notices for a month.
      throw new Error(`HOMEPAGE_PRODUCT_SLUGS references unknown product "${slug}"`)
    }
    return product
  })
}