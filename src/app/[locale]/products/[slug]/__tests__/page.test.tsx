import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
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
      {jsx}
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

  it('links a purchasable product straight to checkout with a one-item cart', async () => {
    // There is no cart yet (B-05), so the CTA carries the item in the URL.
    await renderPage('cherry')

    const cta = screen.getByRole('link', { name: /order now/i })
    expect(cta).toHaveAttribute('href', '/en/checkout?items=cherry%3A1')
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
