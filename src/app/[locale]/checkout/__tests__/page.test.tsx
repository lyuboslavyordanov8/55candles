import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../../messages/en.json'
import CheckoutPage from '../page'

// The action is a server function; the page's own rendering is what is under
// test. `actions.test.ts` covers the real one.
vi.mock('../actions', () => ({
  submitCheckout: vi.fn(async () => ({ status: 'idle' as const })),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/checkout',
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

async function renderPage(items?: string) {
  const jsx = await CheckoutPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(items === undefined ? {} : { items }),
  })

  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {jsx}
    </NextIntlClientProvider>
  )
}

describe('CheckoutPage', () => {
  it('says plainly that orders cannot be placed yet', async () => {
    // The customer learns this here, not after filling in an address.
    await renderPage('cherry:1')

    expect(screen.getByText(/not live yet/i)).toBeInTheDocument()
  })

  it('flags the placeholder delivery rates as illustrative', async () => {
    // A made-up shipping cost presented as real is the failure mode this guards.
    await renderPage('cherry:1')

    expect(screen.getByText(/delivery rates are placeholders/i)).toBeInTheDocument()
  })

  it('shows an empty basket and a way out, rather than a dead form', async () => {
    await renderPage()

    expect(screen.getByText(/basket is empty/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /browse the candles/i })).toHaveAttribute(
      'href',
      '/en/products'
    )
  })

  it('does not render the form with no cart, since it could only fail', async () => {
    await renderPage()

    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument()
  })

  it('lists the cart with a per-line total from the catalogue', async () => {
    const { container } = await renderPage('cherry:2')

    expect(screen.getByText(/cherry/i)).toBeInTheDocument()
    // 2 × 19.99 = 39.98, priced server-side.
    expect(container.querySelector('[data-line-total="3998"]')).toBeInTheDocument()
  })

  it('shows no order total before a delivery method is chosen', async () => {
    // A goods-only "total" that grows at the next step is the pattern consumer
    // law exists to prevent.
    await renderPage('cherry:2')

    expect(screen.getByText(/delivery is added once you choose/i)).toBeInTheDocument()
    expect(screen.queryByText(/^Total$/)).not.toBeInTheDocument()
  })

  it('renders the delivery form once there is something to buy', async () => {
    await renderPage('cherry:1')

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /cash on delivery/i })).toBeInTheDocument()
  })

  it('ignores an unknown slug rather than erroring', async () => {
    await renderPage('not-a-candle:3')

    expect(screen.getByText(/basket is empty/i)).toBeInTheDocument()
  })
})
