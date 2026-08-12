import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { CartProvider } from '@/components/cart/CartProvider'
import messages from '../../../../messages/en.json'
import ProductCard from '../ProductCard'
import { products } from '@/data/products'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const cherry = products.find((p) => p.slug === 'cherry')!
const winter = products.find((p) => p.slug === 'winter-wonderland')!

function renderCard(product = cherry) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CartProvider>
        <ProductCard product={product} locale="en" />
      </CartProvider>
    </NextIntlClientProvider>
  )
}

describe('ProductCard', () => {
  it('renders product name', () => {
    renderCard()
    expect(screen.getByText('Electric Cherry')).toBeInTheDocument()
  })

  // The whole card is the link, so the accessible name comes from its contents
  // rather than from a separate "learn more" control.
  it('links the whole card to the product detail page', () => {
    renderCard()
    const link = screen.getByRole('link', { name: /electric cherry/i })
    expect(link).toHaveAttribute('href', '/en/products/cherry')
  })

  it('gives the image alt text that describes it, not just the name', () => {
    renderCard()
    const image = screen.getByRole('img')
    expect(image.getAttribute('alt')).toContain('Electric Cherry')
    // "Electric Cherry" alone is a label, not a description.
    expect(image.getAttribute('alt')!.length).toBeGreaterThan('Electric Cherry'.length + 8)
  })

  it('states the rating in text for screen readers, not just as stars', () => {
    renderCard()
    expect(screen.getByText(/4\.9 out of 5 stars, 42 reviews/i)).toBeInTheDocument()
  })

  it('shows the review count next to the stars', () => {
    renderCard()
    expect(screen.getByText('(42)')).toBeInTheDocument()
  })

  it('renders no stars for a product with no rating', () => {
    renderCard(winter)
    expect(screen.queryByText(/out of 5 stars/i)).not.toBeInTheDocument()
  })

  it('shows the merchandising badge when one is set', () => {
    renderCard()
    expect(screen.getByText('Bestseller')).toBeInTheDocument()
  })

  it('shows out-of-season overlay when seasonal product is inactive', () => {
    renderCard(winter) // winter.seasonal.active = false
    expect(screen.getByText(/seasonal/i)).toBeInTheDocument()
  })

  it('does not show seasonal overlay for a year-round product', () => {
    renderCard(cherry)
    expect(screen.queryByText(/seasonal/i)).not.toBeInTheDocument()
  })
})
