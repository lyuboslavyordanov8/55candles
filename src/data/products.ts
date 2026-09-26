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
    extraImages: [
      '/images/products/electric-cherry-front.webp',
      '/images/products/electric-cherry-side.webp',
      '/images/products/electric-cherry-tilted.webp',
    ],
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
    extraImages: [
      '/images/products/sweet-orange-front.webp',
      '/images/products/sweet-orange-side.webp',
      '/images/products/sweet-orange-tilted.webp',
    ],
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
    extraImages: [
      '/images/products/vanilla-egg-front.webp',
      '/images/products/vanilla-egg-side.webp',
      '/images/products/vanilla-egg-tilted.webp',
    ],
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
    extraImages: [
      '/images/products/strawberry-cake-front.webp',
      '/images/products/strawberry-cake-side.webp',
      '/images/products/strawberry-cake-tilted.webp',
    ],
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
    extraImages: [
      '/images/products/espresso-martini-front.webp',
      '/images/products/espresso-martini-side.webp',
      '/images/products/espresso-martini-tilted.webp',
    ],
  },

  {
    slug: 'winter-wonderland',
    scent: 'winter-wonderland',
    name: 'Winter Wonderland',

    ingredients: STANDARD_INGREDIENTS,

    accentColor: '#7a9ab8',
    glowColor: 'rgba(122,154,184,0.25)',

    emoji: '❄️',

    // In season: on sale for the winter. Set `active: false` when it ends — the
    // card then shows its out-of-season overlay and checkout refuses it.
    seasonal: { active: true },
    badge: 'winter',
    // Locked until the owner opens it (2026-09-26): shown, not sold, no page.
    comingSoon: true,

    imagePath: '/images/products/winter-wonderland.webp',
    imageWidth: 1087,
    imageHeight: 1087,
    extraImages: [
      '/images/products/winter-wonderland-front.webp',
      '/images/products/winter-wonderland-back.webp',
      '/images/products/winter-wonderland-tilted.webp',
      '/images/products/winter-wonderland-top.webp',
    ],
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
 * the ones we lead with. Winter Wonderland leads while it is in season; take
 * it out of this list when its season ends, or the homepage shows a candle
 * nobody can buy (`products.test.ts` fails if you forget).
 *
 * Note these are slugs, not display names. The slugs are load-bearing: they key
 * `pricing.ts`, the cart URL parameters and the product routes, so renaming a
 * candle means editing its `name` above, never its `slug`.
 */
export const HOMEPAGE_PRODUCT_SLUGS = [
  'winter-wonderland',
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