import type { IngredientKey, Product } from '@/types/product'

/**
 * What every candle in the range is made of, in the order it is shown.
 *
 * Shared because it is genuinely the same four things in every tin; a candle
 * that ever differs should list its own array rather than this constant being
 * edited. These are translation keys, not text — the wording lives under
 * `product.ingredient.*` in both message catalogues.
 */
const STANDARD_INGREDIENTS: readonly IngredientKey[] = [
  'soyWax',
  'cottonWick',
  'fragranceOil',
  'waxDetail',
]

/**
 * The catalogue's structural data. **The prose is not here.**
 *
 * Mood, descriptor, description and scent notes live in `product.copy.<slug>`
 * in `messages/bg.json` and `messages/en.json`, because they used to be English
 * only and Bulgarian customers were reading English product information
 * (AUDIT.md B-22). Add a candle here and its copy there, in both languages;
 * `src/data/__tests__/product-copy.test.ts` fails until you do.
 */
export const products: Product[] = [
  {
    slug: 'cherry',
    scent: 'cherry',
    name: 'Electric Cherry',

    ingredients: STANDARD_INGREDIENTS,

    accentColor: '#e83a3a',
    glowColor: 'rgba(232,58,58,0.25)',

    emoji: '🍒',

    seasonal: null,

    rating: 4.9,
    reviewCount: 42,

    imagePath: '/images/products/electric-cherry.webp',
    imageWidth: 1087,
    imageHeight: 1087,
  },

  {
    slug: 'orange',
    scent: 'orange',
    name: 'Sweet Orange',

    ingredients: STANDARD_INGREDIENTS,

    accentColor: '#f07020',
    glowColor: 'rgba(240,112,32,0.25)',

    emoji: '🍊',

    seasonal: null,

    rating: 4.8,
    reviewCount: 31,
    badge: 'new',

    imagePath: '/images/products/sweet-orange.webp',
    imageWidth: 1088,
    imageHeight: 1088,
  },

  {
    slug: 'vanilla',
    scent: 'vanilla',
    name: 'Vanilla Egg',

    ingredients: STANDARD_INGREDIENTS,

    accentColor: '#c8a040',
    glowColor: 'rgba(200,160,64,0.25)',

    emoji: '🍦',

    seasonal: null,

    rating: 5.0,
    reviewCount: 27,

    imagePath: '/images/products/vanilla-egg.webp',
    imageWidth: 1087,
    imageHeight: 1087,
  },

  {
    slug: 'strawberry',
    scent: 'strawberry',
    name: 'Strawberry Cake',

    ingredients: STANDARD_INGREDIENTS,

    accentColor: '#e8408a',
    glowColor: 'rgba(232,64,138,0.25)',

    emoji: '🍓',

    seasonal: null,

    rating: 4.9,
    reviewCount: 36,
    // The owner's call: Strawberry Cake is the one that actually sells. Only
    // one candle carries this at a time, so Electric Cherry now has no badge.
    badge: 'bestseller',

    imagePath: '/images/products/strawberry-cake.webp',
    imageWidth: 1087,
    imageHeight: 1087,
  },

  {
    slug: 'espresso-martini',
    scent: 'espresso-martini',
    name: 'Espresso Martini',

    ingredients: STANDARD_INGREDIENTS,

    accentColor: '#4a2a18',
    glowColor: 'rgba(74,42,24,0.25)',

    emoji: '🍸',

    seasonal: null,

    rating: 4.7,
    reviewCount: 19,

    imagePath: '/images/products/espresso-martini.webp',
    imageWidth: 1087,
    imageHeight: 1087,
  },

  {
    slug: 'winter-wonderland',
    scent: 'winter-wonderland',
    name: 'Winter Wonderland',

    ingredients: STANDARD_INGREDIENTS,

    accentColor: '#7a9ab8',
    glowColor: 'rgba(122,154,184,0.25)',

    emoji: '❄️',

    seasonal: { active: false },

    imagePath: '/images/products/winter-wonderland.webp',
    imageWidth: 1200,
    imageHeight: 1200,
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