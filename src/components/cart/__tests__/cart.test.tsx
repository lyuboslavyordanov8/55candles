import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import { CartProvider } from '../CartProvider'
import CartButton from '../CartButton'
import CartDrawer from '../CartDrawer'
import AddToCartButton from '../AddToCartButton'

vi.mock('next/navigation', () => ({ usePathname: () => '/en' }))
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

const STORAGE_KEY = '55candles.cart.v1'

/** The header, the drawer and one product's add button, sharing a cart. */
function renderShop() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CartProvider>
        <CartButton />
        <AddToCartButton slug="cherry" productName="Electric Cherry" />
        <AddToCartButton slug="vanilla" productName="Vanilla Egg" />
        <CartDrawer />
      </CartProvider>
    </NextIntlClientProvider>
  )
}

const addCherry = () => screen.getByRole('button', { name: /add electric cherry to cart/i })
const openCart = () => screen.getByRole('button', { name: /^cart|open cart/i })

beforeEach(() => {
  window.localStorage.clear()
})

describe('cart', () => {
  it('starts with no badge at all, rather than a zero', async () => {
    renderShop()
    await waitFor(() => expect(screen.getByRole('button', { name: /open cart/i })).toBeInTheDocument())
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('adding from a card updates the count in the cart button name', async () => {
    const user = userEvent.setup()
    renderShop()

    await user.click(addCherry())

    expect(screen.getByRole('button', { name: /cart, 1 item/i })).toBeInTheDocument()
  })

  it('counts quantities, not distinct products', async () => {
    const user = userEvent.setup()
    renderShop()

    await user.click(addCherry())
    await user.click(addCherry())
    await user.click(screen.getByRole('button', { name: /add vanilla egg to cart/i }))

    expect(screen.getByRole('button', { name: /cart, 3 items/i })).toBeInTheDocument()
  })

  // The confirmation is a label swap, which a screen reader would not
  // necessarily report on its own.
  it('announces the addition in words', async () => {
    const user = userEvent.setup()
    renderShop()

    await user.click(addCherry())

    // Every add button carries its own live region, so there are several on a
    // grid; only the one whose product was added has anything to say.
    const announced = screen.getAllByRole('status').map((el) => el.textContent)
    expect(announced).toContain('Electric Cherry added to cart')
  })

  // On phones the control is an icon with no visible text, so its accessible
  // name is the only thing identifying it. Both forms are in the markup and CSS
  // picks one, which means the name has to carry the product either way.
  it('names the quick-add control even when it shows no text', () => {
    renderShop()
    expect(addCherry()).toHaveAccessibleName('Add Electric Cherry to cart')
  })

  it('does not open the drawer on add, so browsing is not interrupted', async () => {
    const user = userEvent.setup()
    renderShop()

    await user.click(addCherry())

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the drawer from the header and lists what is in it', async () => {
    const user = userEvent.setup()
    renderShop()

    await user.click(addCherry())
    await user.click(openCart())

    const drawer = await screen.findByRole('dialog')
    expect(drawer).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Electric Cherry' })).toBeInTheDocument()
  })

  it('shows the goods subtotal, priced from the catalogue', async () => {
    const user = userEvent.setup()
    renderShop()

    await user.click(addCherry())
    await user.click(addCherry())
    await user.click(openCart())

    await screen.findByRole('dialog')

    // 2 × 19,99 EUR. Scoped to the footer row, because the line total shows the
    // same figure — and asserted on the digits rather than the whole string, so
    // the test does not depend on Intl's spacing or symbol placement.
    const footerRow = screen.getByText(messages.cart.subtotal).parentElement!
    expect(footerRow.textContent).toMatch(/39[.,]98/)
  })

  it('says delivery is still to come, so the subtotal is not read as the total', async () => {
    const user = userEvent.setup()
    renderShop()

    await user.click(addCherry())
    await user.click(openCart())

    await screen.findByRole('dialog')
    expect(screen.getByText(messages.cart.deliveryNote)).toBeInTheDocument()
  })

  it('adjusts quantity from the drawer', async () => {
    const user = userEvent.setup()
    renderShop()

    await user.click(addCherry())
    await user.click(openCart())
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: /increase quantity of electric cherry/i }))
    expect(screen.getByRole('button', { name: /cart, 2 items/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /decrease quantity of electric cherry/i }))
    expect(screen.getByRole('button', { name: /cart, 1 item/i })).toBeInTheDocument()
  })

  it('removes a line when its quantity reaches zero', async () => {
    const user = userEvent.setup()
    renderShop()

    await user.click(addCherry())
    await user.click(openCart())
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: /decrease quantity of electric cherry/i }))

    expect(screen.getByText(messages.cart.empty)).toBeInTheDocument()
  })

  // The whole point of the design: the cart hands off through the URL the
  // checkout page already parses, so checkout needed no changes.
  it('hands off to checkout through the existing items parameter', async () => {
    const user = userEvent.setup()
    renderShop()

    await user.click(addCherry())
    await user.click(addCherry())
    await user.click(screen.getByRole('button', { name: /add vanilla egg to cart/i }))
    await user.click(openCart())
    await screen.findByRole('dialog')

    expect(screen.getByRole('link', { name: /go to checkout/i })).toHaveAttribute(
      'href',
      '/en/checkout?items=cherry%3A2%2Cvanilla%3A1'
    )
  })

  it('survives a reload', async () => {
    const user = userEvent.setup()
    const { unmount } = renderShop()

    await user.click(addCherry())
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toContain('cherry')
    )
    unmount()

    renderShop()
    expect(await screen.findByRole('button', { name: /cart, 1 item/i })).toBeInTheDocument()
  })

  it('drops a stored product that can no longer be bought', async () => {
    // Winter Wonderland is out of season, so it is not orderable even though it
    // is priced. A cart left over from when it was must not resurrect it.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ slug: 'winter-wonderland', quantity: 1 }, { slug: 'cherry', quantity: 2 }])
    )

    renderShop()

    expect(await screen.findByRole('button', { name: /cart, 2 items/i })).toBeInTheDocument()
  })

  it('ignores corrupt stored data instead of crashing', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{ not json')

    renderShop()

    expect(await screen.findByRole('button', { name: /open cart/i })).toBeInTheDocument()
  })

  it('ignores an unknown slug in stored data', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ slug: 'not-a-candle', quantity: 3 }])
    )

    renderShop()

    expect(await screen.findByRole('button', { name: /open cart/i })).toBeInTheDocument()
  })

  /**
   * Regression: closing the drawer left the page permanently unscrollable.
   *
   * The drawer locked body scroll in its own effect while `useFocusTrap` was
   * already doing the same thing. Both saved "the previous value" and both
   * restored it, but the trap's effect was registered first, so it read the
   * real value ('') and the drawer read what the trap had just written
   * ('hidden'). React tears effects down in registration order, so the trap
   * restored '' and the drawer immediately put 'hidden' back. The page then
   * could not be scrolled again until a full reload.
   */
  describe('body scroll lock', () => {
    beforeEach(() => {
      document.body.style.overflow = ''
      document.body.style.paddingRight = ''
    })

    it('locks page scroll while the drawer is open', async () => {
      const user = userEvent.setup()
      renderShop()
      await user.click(addCherry())
      await user.click(openCart())

      await waitFor(() => expect(document.body.style.overflow).toBe('hidden'))
    })

    it('restores page scroll after the drawer closes', async () => {
      const user = userEvent.setup()
      renderShop()
      await user.click(addCherry())
      await user.click(openCart())
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      await user.keyboard('{Escape}')

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      // The assertion that was failing: 'hidden' here means the shopper is
      // stuck on whatever part of the page they were looking at.
      await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'))
    })

    it('survives being opened and closed repeatedly', async () => {
      const user = userEvent.setup()
      renderShop()
      await user.click(addCherry())

      for (let i = 0; i < 3; i++) {
        await user.click(openCart())
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
        await user.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      }

      await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'))
    })
  })
})
