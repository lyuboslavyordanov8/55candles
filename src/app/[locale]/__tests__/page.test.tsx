import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { CartProvider } from '@/components/cart/CartProvider'
import messages from '../../../../messages/en.json'
import HomePage from '../page'
import { homeBanner } from '@/content/home-banner'
import { HOMEPAGE_PRODUCT_SLUGS } from '@/data/products'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
}))

async function renderPage() {
  const jsx = await HomePage({ params: Promise.resolve({ locale: 'en' }) })
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CartProvider>
        {jsx}
      </CartProvider>
    </NextIntlClientProvider>
  )
}

describe('HomePage', () => {
  // Asserted against the content file rather than a copied string: the point of
  // that file is that the banner can be reworded without touching code, and a
  // hardcoded expectation here would make that a two-file change.
  it('renders the banner heading from the content file', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { level: 1, name: homeBanner.heading.en })).toBeInTheDocument()
  })

  it('points the banner CTA at the configured link', async () => {
    await renderPage()
    const cta = screen.getByRole('link', { name: homeBanner.ctaLabel.en })
    expect(cta).toHaveAttribute('href', `/en${homeBanner.ctaHref}`)
  })

  it('renders every section heading in order', async () => {
    await renderPage()
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)

    // Order is the page's rhythm, not an accident — the backgrounds alternate
    // around it. Adding a section means deciding where it goes, so this list
    // is meant to be edited deliberately rather than loosened.
    expect(headings).toEqual([
      'Products',
      messages.storyTeaser.headline,
      messages.discover.title,
      'Candle care',
      'What people say about us',
    ])
  })

  it('renders one card per homepage product, in the configured order', async () => {
    await renderPage()

    const cardHrefs = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => /^\/en\/products\/[a-z-]+$/.test(href))

    expect(cardHrefs).toEqual(HOMEPAGE_PRODUCT_SLUGS.map((slug) => `/en/products/${slug}`))
  })

  it('does not show the out-of-season candle on the homepage', async () => {
    await renderPage()
    expect(screen.queryByText('Winter Wonderland')).not.toBeInTheDocument()
  })
})
