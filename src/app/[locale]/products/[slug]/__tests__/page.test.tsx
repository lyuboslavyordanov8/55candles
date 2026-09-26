import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { CartProvider } from '@/components/cart/CartProvider'
import { notFound } from 'next/navigation'
import messages from '../../../../../../messages/en.json'
import { products, productImages } from '@/data/products'
import ProductDetailPage from '../page'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
// The real notFound() throws to halt rendering, so the mock must too —
// otherwise execution continues past the guard with an undefined product.
const NOT_FOUND = new Error('NEXT_NOT_FOUND')

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/products/cherry',
  notFound: vi.fn(() => {
    throw NOT_FOUND
  }),
}))

async function renderPage(slug = 'cherry') {
  const jsx = await ProductDetailPage({ params: Promise.resolve({ locale: 'en', slug }) })
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CartProvider>
        {jsx}
      </CartProvider>
    </NextIntlClientProvider>
  )
}

describe('ProductDetailPage', () => {
  it('renders the product name', async () => {
    await renderPage('cherry')
    expect(screen.getByRole('heading', { name: /cherry/i })).toBeInTheDocument()
  })

  it('renders scent notes section', async () => {
    await renderPage('cherry')
    expect(screen.getByText(/scent notes/i)).toBeInTheDocument()
  })

  it('renders ingredients section', async () => {
    await renderPage('cherry')
    expect(screen.getByText(/ingredients/i)).toBeInTheDocument()
  })

  it('shows the price', async () => {
    const { container } = await renderPage('cherry')
    expect(container.querySelector('[data-price="1999"]')).toBeInTheDocument()
  })

  // The CTA used to jump straight to checkout with a one-item URL cart,
  // because there was no cart. There is now, so it adds to it and leaves the
  // shopper where they are.
  it('adds a purchasable product to the cart rather than leaving the page', async () => {
    await renderPage('cherry')

    const cta = screen.getByRole('button', { name: /add electric cherry to cart/i })
    expect(cta).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /order now/i })).not.toBeInTheDocument()
  })

  // Driven off the catalogue rather than hard-coded, so it asserts the wiring,
  // not a count: the gallery is handed one frame per `productImages()` entry
  // and shows its picker only when that is more than one. Change a product's
  // `extraImages` and this test follows it without being edited. The picker's
  // own behaviour is covered in `ProductGallery.test.tsx`.
  it('gives the gallery every photo the product has', async () => {
    const { container } = await renderPage('cherry')
    const photos = productImages(products.find((p) => p.slug === 'cherry')!)

    for (const src of photos) {
      expect(container.querySelector(`img[src="${src}"]`)).toBeInTheDocument()
    }

    expect(screen.queryAllByRole('tab')).toHaveLength(photos.length > 1 ? photos.length : 0)
  })

  it('omits the picker for a product with a single photo', async () => {
    // Every candle is photographed now, so one is made single-photo here.
    const cherry = products.find((p) => p.slug === 'cherry')!
    const extras = cherry.extraImages
    cherry.extraImages = undefined
    try {
      await renderPage('cherry')
      expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    } finally {
      cherry.extraImages = extras
    }
  })

  it('keeps an out-of-season product unbuyable, priced or not', async () => {
    // winter-wonderland keeps its price out of season, so only the season stops
    // it. A link here would lead to a checkout that refuses the order.
    const winter = products.find((p) => p.slug === 'winter-wonderland')!
    winter.seasonal = { active: false }
    winter.comingSoon = false
    try {
      await renderPage('winter-wonderland')

      expect(screen.queryByRole('link', { name: /order now/i })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /not available yet/i })).toBeDisabled()
    } finally {
      winter.seasonal = { active: true }
      winter.comingSoon = true
    }
  })

  it('calls notFound for a coming-soon product', async () => {
    await expect(renderPage('winter-wonderland')).rejects.toThrow(NOT_FOUND)
    expect(notFound).toHaveBeenCalled()
  })

  it('calls notFound for unknown slug', async () => {
    await expect(renderPage('does-not-exist')).rejects.toThrow(NOT_FOUND)
    expect(notFound).toHaveBeenCalled()
  })
})
