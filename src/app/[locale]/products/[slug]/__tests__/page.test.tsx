import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { CartProvider } from '@/components/cart/CartProvider'
import { notFound } from 'next/navigation'
import messages from '../../../../../../messages/en.json'
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

  it('shows every photo the product has, with a picker', async () => {
    await renderPage('cherry')

    // Electric Cherry has the illustration plus a photo of the tin.
    expect(screen.getByRole('tab', { name: /photo 1 of 2/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /photo 2 of 2/i })).toBeInTheDocument()
  })

  it('omits the picker for a product with a single photo', async () => {
    await renderPage('winter-wonderland')
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('keeps an out-of-season product unbuyable, priced or not', async () => {
    // winter-wonderland has a price, so only the season stops it. A link here
    // would lead to a checkout that refuses the order.
    await renderPage('winter-wonderland')

    expect(screen.queryByRole('link', { name: /order now/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /not available yet/i })).toBeDisabled()
  })

  it('calls notFound for unknown slug', async () => {
    await expect(renderPage('does-not-exist')).rejects.toThrow(NOT_FOUND)
    expect(notFound).toHaveBeenCalled()
  })
})
