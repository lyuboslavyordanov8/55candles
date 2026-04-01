import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import ProductCard from '../ProductCard'
import { products } from '@/data/products'

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const cherry = products.find((p) => p.slug === 'cherry')!
const winter = products.find((p) => p.slug === 'winter-wonderland')!

function renderCard(product = cherry) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProductCard product={product} locale="en" />
    </NextIntlClientProvider>
  )
}

describe('ProductCard', () => {
  it('renders product name', () => {
    renderCard()
    expect(screen.getByText('Cherry')).toBeInTheDocument()
  })

  it('renders descriptor', () => {
    renderCard()
    expect(screen.getByText(cherry.descriptor)).toBeInTheDocument()
  })

  it('renders learn more link pointing to product detail', () => {
    renderCard()
    const link = screen.getByRole('link', { name: /learn more/i })
    expect(link).toHaveAttribute('href', '/en/products/cherry')
  })

  it('shows seasonal badge when seasonal product is active', () => {
    const activeWinter = { ...winter, seasonal: { active: true } }
    renderCard(activeWinter)
    // Should find the badge span with the seasonal text (positioned at top-right)
    const seasonalSpans = screen.getAllByText(/seasonal/i)
    const badgeSpan = seasonalSpans.find((el) => el.className.includes('top-3'))
    expect(badgeSpan).toBeInTheDocument()
  })

  it('shows out-of-season overlay when seasonal product is inactive', () => {
    renderCard(winter) // winter.seasonal.active = false
    // Should find the overlay span with the seasonal text, not the descriptor
    const seasonalSpans = screen.getAllByText(/seasonal/i)
    const overlaySpan = seasonalSpans.find((el) => el.className.includes('text-white'))
    expect(overlaySpan).toBeInTheDocument()
  })

  it('does not show seasonal badge for year-round product', () => {
    renderCard(cherry)
    expect(screen.queryByText(/seasonal/i)).not.toBeInTheDocument()
  })
})
