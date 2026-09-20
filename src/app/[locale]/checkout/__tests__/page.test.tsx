import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../../messages/en.json'
import { CartProvider } from '@/components/cart/CartProvider'
import { PRICING_IS_PROVISIONAL } from '@/data/pricing'
import CheckoutPage from '../page'

// The action is a server function; the page's own rendering is what is under
// test. `actions.test.ts` covers the real one.
vi.mock('../actions', () => ({
  submitCheckout: vi.fn(async () => ({ status: 'idle' as const })),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/checkout',
  // The basket editor rewrites `?items=` through the router. Nothing here
  // asserts on that — `BasketEditor.test.tsx` does — but without the mock the
  // page cannot render at all.
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

async function renderPage(items?: string) {
  const jsx = await CheckoutPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(items === undefined ? {} : { items }),
  })

  // `CartProvider` because the basket editor mirrors its edits into the stored
  // cart, so the header badge cannot disagree with this page.
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CartProvider>{jsx}</CartProvider>
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

  it('does not call the prices or the weight stand-ins, now that they are real', async () => {
    // They were, and one notice covered both; when the owner supplied the real
    // price and weight the sentence kept calling them placeholders — a claim the
    // customer cannot check and has no reason to disbelieve. The two notices are
    // gated separately now, so this fails if they are merged again.
    expect(PRICING_IS_PROVISIONAL).toBe(false)
    await renderPage('cherry:1')

    expect(screen.queryByText(/stand-ins/i)).not.toBeInTheDocument()
    expect(screen.getByText(/does not affect the candle prices/i)).toBeInTheDocument()
  })

  it('stops calling the rates illustrative once Econt prices them', async () => {
    // The other half of the notice above, and the half that is easy to forget:
    // once the courier quotes each parcel, telling the customer their delivery
    // cost is a placeholder is false in the opposite direction. Credentials plus
    // a hand-over point are what flips it, so both are set here.
    const saved = { ...process.env }
    process.env.ECONT_USERNAME = 'iasp-dev'
    process.env.ECONT_PASSWORD = '1Asp-dev'
    process.env.ECONT_SENDER_OFFICE_CODE = '1120'

    try {
      await renderPage('cherry:1')

      expect(screen.queryByText(/delivery rates are placeholders/i)).not.toBeInTheDocument()
      // The order flow is still not live for its own reasons — no confirmation
      // email, draft legal pages — so that notice stays.
      expect(screen.getByText(/not live yet/i)).toBeInTheDocument()
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in saved)) delete process.env[key]
      }
      Object.assign(process.env, saved)
    }
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
    // Payment is stated, not offered as a choice — cash on delivery is the only
    // method (`src/lib/payments.ts`), so the form has no radio to click.
    expect(screen.getByText(/cash on delivery/i)).toBeInTheDocument()
  })

  it('searches real offices with no configuration, and says nothing about test data', async () => {
    // The default state of this repository, and the point of the credential-free
    // lookup: real offices out of the box (AUDIT.md Q-22). Proves the wiring from
    // `econtEnvironment()` through to the picker; the picker's own behaviour is
    // `OfficePicker.test.tsx`.
    await renderPage('cherry:1')

    expect(screen.getByLabelText(/city or post code/i)).toBeInTheDocument()
    expect(screen.queryByText(/test system/i)).not.toBeInTheDocument()
  })

  it('warns that the offices are test records on the demo environment', async () => {
    vi.stubEnv('ECONT_ENV', 'demo')

    try {
      await renderPage('cherry:1')

      expect(screen.getByLabelText(/city or post code/i)).toBeInTheDocument()
      expect(screen.getByText(/test system/i)).toBeInTheDocument()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('ignores an unknown slug rather than erroring', async () => {
    await renderPage('not-a-candle:3')

    expect(screen.getByText(/basket is empty/i)).toBeInTheDocument()
  })
})
