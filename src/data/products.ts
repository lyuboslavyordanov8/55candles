import type { Product } from '@/types/product'

export const products: Product[] = [
  {
    slug: 'cherry',
    scent: 'cherry',
    name: 'Cherry',
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

    imagePath: '/images/candles/IMG_7520.webp',
    hoverImagePath: '/images/candles/IMG_7520_alt.webp',
  },

  {
    slug: 'orange',
    scent: 'orange',
    name: 'Orange',
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

    imagePath: '/images/candles/IMG_7522.webp',
    hoverImagePath: '/images/candles/IMG_7522_alt.webp',
  },

  {
    slug: 'vanilla',
    scent: 'vanilla',
    name: 'Vanilla',
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

    imagePath: '/images/candles/IMG_7523.webp',
    hoverImagePath: '/images/candles/IMG_7523_alt.webp',
  },

  {
    slug: 'strawberry',
    scent: 'strawberry',
    name: 'Strawberry',
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

    imagePath: '/images/candles/IMG_7521.webp',
    hoverImagePath: '/images/candles/IMG_7521_alt.webp',
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

    imagePath: '/images/candles/IMG_7524.webp',
    hoverImagePath: '/images/candles/IMG_7524_alt.webp',
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

    imagePath: '/images/products/winter-wonderland.jpg',
  },
]

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug)
}