import type { Product } from '@/types/product'

export const products: Product[] = [
  {
    slug: 'cherry',
    scent: 'cherry',
    name: 'Cherry',
    descriptor: 'Sweet & fruity · Cherry wax top',
    description:
      'A warm, playful cherry scent — rich and sweet, like summer in a can. The hand-sculpted cherry on top makes it almost too good to light.',
    scentNotes: { top: 'Cherry, Raspberry', heart: 'Rose, Jasmine', base: 'Musk, Sandalwood' },
    ingredients: ['Soy wax', 'Cotton wick', 'Phthalate-free fragrance oil', 'Wax fruit decoration'],
    accentColor: '#e83a3a',
    emoji: '🍒',
    seasonal: null,
    price: null,
    imagePath: '/images/products/cherry.jpg',
  },
  {
    slug: 'orange',
    scent: 'orange',
    name: 'Orange',
    descriptor: 'Bright & zesty · Orange wax top',
    description:
      'Fresh-squeezed sunshine. This citrus scent is uplifting and clean, with a wax orange perched on top that looks straight from a fruit bowl.',
    scentNotes: { top: 'Orange, Bergamot', heart: 'White Tea, Neroli', base: 'Cedarwood, Musk' },
    ingredients: ['Soy wax', 'Cotton wick', 'Phthalate-free fragrance oil', 'Wax fruit decoration'],
    accentColor: '#f07020',
    emoji: '🍊',
    seasonal: null,
    price: null,
    imagePath: '/images/products/orange.jpg',
  },
  {
    slug: 'vanilla',
    scent: 'vanilla',
    name: 'Vanilla',
    descriptor: 'Warm & creamy · Vanilla wax top',
    description:
      'Rich, comforting, and irresistibly warm. Our vanilla is the one guests always ask about — soft enough for every room.',
    scentNotes: { top: 'Vanilla Pod, Caramel', heart: 'Tonka Bean, Amber', base: 'Musk, Sandalwood' },
    ingredients: ['Soy wax', 'Cotton wick', 'Phthalate-free fragrance oil', 'Wax fruit decoration'],
    accentColor: '#c8a040',
    emoji: '🍦',
    seasonal: null,
    price: null,
    imagePath: '/images/products/vanilla.jpg',
  },
  {
    slug: 'strawberry',
    scent: 'strawberry',
    name: 'Strawberry',
    descriptor: 'Juicy & fresh · Strawberry wax top',
    description:
      'Garden-fresh strawberry with a hint of sweetness. The sculpted wax strawberry on top is so realistic, put it near fruit and see what happens.',
    scentNotes: { top: 'Strawberry, Peach', heart: 'Jasmine, Violet', base: 'Musk, Light Wood' },
    ingredients: ['Soy wax', 'Cotton wick', 'Phthalate-free fragrance oil', 'Wax fruit decoration'],
    accentColor: '#e8408a',
    emoji: '🍓',
    seasonal: null,
    price: null,
    imagePath: '/images/products/strawberry.jpg',
  },
  {
    slug: 'espresso-martini',
    scent: 'espresso-martini',
    name: 'Espresso Martini',
    descriptor: 'Bold & roasted · Coffee wax top',
    description:
      'Dark, sophisticated, and a little indulgent. Coffee lovers will be obsessed — and the coffee bean wax top is the perfect finishing touch.',
    scentNotes: { top: 'Espresso, Dark Chocolate', heart: 'Vanilla, Tonka Bean', base: 'Amber, Musk' },
    ingredients: ['Soy wax', 'Cotton wick', 'Phthalate-free fragrance oil', 'Wax decoration'],
    accentColor: '#4a2a18',
    emoji: '🍸',
    seasonal: null,
    price: null,
    imagePath: '/images/products/espresso-martini.jpg',
  },
  {
    slug: 'winter-wonderland',
    scent: 'winter-wonderland',
    name: 'Winter Wonderland',
    descriptor: 'Cool & festive · Seasonal only',
    description:
      'A limited Christmas edition — crisp pine, warm spice, and a dusting of vanilla snow. Available only while the season lasts.',
    scentNotes: { top: 'Pine, Eucalyptus', heart: 'Cinnamon, Clove', base: 'Vanilla, Amber' },
    ingredients: ['Soy wax', 'Cotton wick', 'Phthalate-free fragrance oil', 'Wax decoration'],
    accentColor: '#7a9ab8',
    emoji: '❄️',
    seasonal: { active: false }, // Set to true during Christmas season
    price: null,
    imagePath: '/images/products/winter-wonderland.jpg',
  },
]

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug)
}
