import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { CartProvider } from '@/components/cart/CartProvider'
import messages from '../../../../../messages/en.json'
import ProductsPage from '../page'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/products',
}))

async function renderPage() {
  const jsx = await ProductsPage({ params: Promise.resolve({ locale: 'en' }) })
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CartProvider>
        {jsx}
      </CartProvider>
    </NextIntlClientProvider>
  )
}

describe('ProductsPage', () => {
  it('renders section title', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /products/i })).toBeInTheDocument()
  })

  // The card itself is the link now — there is no separate "learn more"
  // control, so count the cards by where they point.
  it('renders a card linking to every product but the coming-soon one', async () => {
    await renderPage()

    const cardHrefs = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => /^\/en\/products\/[a-z-]+$/.test(href))

    expect(cardHrefs).toHaveLength(5)
    expect(cardHrefs).not.toContain('/en/products/winter-wonderland')
  })
})
