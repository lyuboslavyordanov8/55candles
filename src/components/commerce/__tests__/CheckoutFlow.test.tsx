import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import { CartProvider } from '@/components/cart/CartProvider'
import { submitCheckout } from '@/app/[locale]/checkout/actions'
import CheckoutFlow from '../CheckoutFlow'

/**
 * The bug this answers: the basket editor above the delivery form did not know
 * an order had been placed, so its ± buttons stayed live after checkout. A
 * press there rewrote `?items=` with a basket that no longer matched the
 * receipt below it, and the priced summary vanished along with it (see
 * `sameBasket` in `DeliveryForm.tsx`). `CheckoutFlow` is the parent that can see
 * both halves and hide the basket once `DeliveryForm` reports the order placed.
 */

vi.mock('@/app/[locale]/checkout/actions', () => ({
  submitCheckout: vi.fn(async () => ({ status: 'idle' as const })),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/checkout',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

function renderFlow() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CartProvider>
        <CheckoutFlow
          cart={[{ slug: 'cherry', quantity: 1 }]}
          locale="en"
          intentToken="intent-under-test"
          shippingConfigured={false}
          promoCodesEnabled={false}
          officeLookup={[]}
          officeDataIsDemo={false}
        />
      </CartProvider>
    </NextIntlClientProvider>
  )
}

async function fillAndPlace(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/full name/i), 'Мария Иванова')
  await user.type(screen.getByLabelText(/mobile number/i), '0887115957')
  await user.type(screen.getByLabelText(/^city$/i), 'София')
  await user.type(screen.getByLabelText(/post code/i), '1000')
  await user.type(screen.getByLabelText(/office or locker/i), 'ECONT-1234')

  const buttons = document.querySelectorAll('form button[type="submit"]')
  await user.click(buttons[0])
}

describe('CheckoutFlow', () => {
  it('shows the basket and the free-delivery nudge before an order exists', () => {
    renderFlow()

    expect(screen.getByRole('heading', { name: /your basket/i })).toBeInTheDocument()
    expect(screen.getByText(/electric cherry/i)).toBeInTheDocument()
  })

  it('hides the basket editor once the order is placed, so it cannot desync the receipt', async () => {
    const user = userEvent.setup()
    vi.mocked(submitCheckout).mockImplementationOnce(async () => ({
      status: 'placed' as const,
      order: { number: '55C-2026-000123' },
      messageKey: 'orderPlacedCod',
    }))

    renderFlow()
    await fillAndPlace(user)

    await screen.findByText('55C-2026-000123', {}, { timeout: 5_000 })

    // `onOrderPlaced` fires from an effect in `DeliveryForm`, one render after
    // the order number itself appears — the basket disappears on the render
    // that follows, not the one `findByText` above already resolved on.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /your basket/i })).not.toBeInTheDocument()
    })
    // The ± controls are the actual hazard: gone along with the heading.
    expect(
      screen.queryByRole('button', { name: /increase quantity of electric cherry/i })
    ).not.toBeInTheDocument()
  })
})
