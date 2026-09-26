import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { CartProvider } from '@/components/cart/CartProvider'
import messages from '../../../../messages/en.json'
import HomePage from '../page'
import { homeBanner } from '@/content/home-banner'
import { getProductBySlug, HOMEPAGE_PRODUCT_SLUGS } from '@/data/products'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
// The real notFound() throws to halt rendering, so the mock must too.
const NOT_FOUND = new Error('NEXT_NOT_FOUND')

vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
  notFound: vi.fn(() => {
    throw NOT_FOUND
  }),
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

  // The banner picture has been a 0-byte file and has been left out by a
  // refactor before, and both times the page still rendered and still passed —
  // it is the one image on the site whose absence is the whole first screen.
  it('renders the banner photograph with its described alt text', async () => {
    await renderPage()
    const photo = screen.getByAltText(homeBanner.alt.en)
    expect(photo).toHaveAttribute('src', homeBanner.image)
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

    // A coming-soon card is shown but links nowhere.
    const linked = HOMEPAGE_PRODUCT_SLUGS.filter((slug) => !getProductBySlug(slug)?.comingSoon)
    expect(cardHrefs).toEqual(linked.map((slug) => `/en/products/${slug}`))
  })

  it('leads with the winter edition while it is in season', async () => {
    await renderPage()
    expect(screen.getByText('Winter Wonderland')).toBeInTheDocument()
  })

  /*
    A request for a static file that does not exist reaches this page with the
    filename as the locale — `[locale]` is a single segment and the proxy skips
    paths containing a dot. The layout 404s, but it renders in parallel with this
    page, so without a guard here the whole homepage still renders under a locale
    that Intl cannot parse, and every price throws.
  */
  it('404s instead of rendering under a segment that is not a locale', async () => {
    for (const junk of ['apple-touch-icon.png', 'site.webmanifest', '']) {
      await expect(
        HomePage({ params: Promise.resolve({ locale: junk }) })
      ).rejects.toThrow(NOT_FOUND)
    }
  })
})
