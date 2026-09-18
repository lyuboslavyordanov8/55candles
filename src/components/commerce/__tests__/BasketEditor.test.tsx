import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import { CartProvider } from '@/components/cart/CartProvider'
import CartButton from '@/components/cart/CartButton'
import BasketEditor from '../BasketEditor'
import { MAX_QUANTITY_PER_LINE } from '@/lib/cart-params'

/**
 * The basket on the checkout page, editable (AUDIT.md B-05).
 *
 * What is actually being tested is a promise about *where the truth lives*: the
 * component may not keep its own copy of the basket. Every edit has to leave the
 * page through the URL, because that is the only route by which the server gets
 * to re-price the order. So the assertions are mostly about the `router.replace`
 * argument, not about the number on screen.
 */

const replace = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/checkout',
  useRouter: () => ({ replace, push: vi.fn() }),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

const STORAGE_KEY = '55candles.cart.v1'

function renderBasket(lines: Array<{ slug: string; quantity: number }>) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CartProvider>
        <CartButton />
        <BasketEditor lines={lines} locale="en" />
      </CartProvider>
    </NextIntlClientProvider>
  )
}

const decrease = (name: RegExp) => screen.getByRole('button', { name })
const cherryUp = () => screen.getByRole('button', { name: /increase quantity of electric cherry/i })
const cherryDown = () =>
  screen.getByRole('button', { name: /decrease quantity of electric cherry/i })

beforeEach(() => {
  replace.mockClear()
  window.localStorage.clear()
})

describe('BasketEditor', () => {
  it('names, counts and prices every line', async () => {
    // The owner's complaint about the old read-only list: it said "Candles".
    const { container } = renderBasket([
      { slug: 'cherry', quantity: 2 },
      { slug: 'orange', quantity: 1 },
    ])

    expect(screen.getByText('Electric Cherry')).toBeInTheDocument()
    expect(screen.getByText('Sweet Orange')).toBeInTheDocument()
    // 2 × 19.99 and 1 × 19.99, both priced from the catalogue.
    expect(container.querySelector('[data-line-total="3998"]')).toBeInTheDocument()
    expect(container.querySelector('[data-line-total="1999"]')).toBeInTheDocument()
    expect(screen.getByText(/2 × €19.99/)).toBeInTheDocument()
  })

  it('increasing a line rewrites the URL so the server re-prices it', async () => {
    const user = userEvent.setup()
    renderBasket([{ slug: 'cherry', quantity: 2 }])

    await user.click(cherryUp())

    expect(replace).toHaveBeenCalledWith('/en/checkout?items=cherry%3A3', { scroll: false })
  })

  it('decreasing above one takes off exactly one', async () => {
    const user = userEvent.setup()
    renderBasket([{ slug: 'cherry', quantity: 3 }])

    await user.click(cherryDown())

    expect(replace).toHaveBeenCalledWith('/en/checkout?items=cherry%3A2', { scroll: false })
  })

  it('decreasing the last one removes the line instead of leaving a zero', async () => {
    // The owner asked for this explicitly, and it is the right behaviour: a line
    // reading "0 × Electric Cherry" is not a basket state, it is a bug.
    const user = userEvent.setup()
    renderBasket([
      { slug: 'cherry', quantity: 1 },
      { slug: 'orange', quantity: 2 },
    ])

    await user.click(cherryDown())

    expect(replace).toHaveBeenCalledWith('/en/checkout?items=orange%3A2', { scroll: false })
  })

  it('emptying the basket drops the parameter rather than sending an empty one', async () => {
    // `?items=` is not an empty basket, it is a parse question nobody needs.
    const user = userEvent.setup()
    renderBasket([{ slug: 'cherry', quantity: 1 }])

    await user.click(cherryDown())

    expect(replace).toHaveBeenCalledWith('/en/checkout', { scroll: false })
  })

  it('removes a whole line in one click, however many are in it', async () => {
    const user = userEvent.setup()
    renderBasket([
      { slug: 'cherry', quantity: 5 },
      { slug: 'orange', quantity: 1 },
    ])

    await user.click(decrease(/remove electric cherry from cart/i))

    expect(replace).toHaveBeenCalledWith('/en/checkout?items=orange%3A1', { scroll: false })
  })

  it('will not order more of one candle than the shop will pack', async () => {
    const user = userEvent.setup()
    renderBasket([{ slug: 'cherry', quantity: MAX_QUANTITY_PER_LINE }])

    expect(cherryUp()).toBeDisabled()
    await user.click(cherryUp())

    expect(replace).not.toHaveBeenCalled()
  })

  it('counts a second click from the value it just showed, not the one in flight', async () => {
    // Without `useOptimistic` the props are still the server's old lines on the
    // second click, so two presses of + would both ask for 3 and one would be
    // silently lost. This is the whole reason the optimistic state exists.
    const user = userEvent.setup()
    renderBasket([{ slug: 'cherry', quantity: 2 }])

    await user.click(cherryUp())
    await user.click(cherryUp())

    expect(replace).toHaveBeenLastCalledWith('/en/checkout?items=cherry%3A4', { scroll: false })
  })

  it('editing a second line does not undo the first', async () => {
    // Both edits are outstanding at once, and the URL carries the whole basket —
    // so rebuilding it from the props alone would quietly revert the earlier one.
    const user = userEvent.setup()
    renderBasket([
      { slug: 'cherry', quantity: 1 },
      { slug: 'orange', quantity: 1 },
    ])

    await user.click(cherryUp())
    await user.click(screen.getByRole('button', { name: /increase quantity of sweet orange/i }))

    expect(replace).toHaveBeenLastCalledWith('/en/checkout?items=cherry%3A2%2Corange%3A2', {
      scroll: false,
    })
  })

  it('keeps the header badge in step, so the two cannot disagree', async () => {
    // The stored cart is what the badge and the drawer read. An edit here that
    // did not reach it would leave the badge claiming three items while this
    // page showed four, and reopening the drawer would undo the change.
    const user = userEvent.setup()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([{ slug: 'cherry', quantity: 2 }]))
    renderBasket([{ slug: 'cherry', quantity: 2 }])

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /cart, 2 items/i })).toBeInTheDocument()
    )

    await user.click(cherryUp())

    expect(screen.getByRole('button', { name: /cart, 3 items/i })).toBeInTheDocument()
  })

  it('says "price on request" rather than rendering an unpriced line as free', async () => {
    // B-03. Every catalogue product happens to be priced today, so this is
    // reached with a slug that is not one — the same state a product added
    // before its price is set would produce.
    renderBasket([{ slug: 'not-priced-yet', quantity: 1 }])

    expect(screen.getByText(/price on request/i)).toBeInTheDocument()
    // And the row is still identifiable, rather than a bare price-less box.
    expect(screen.getByText('not-priced-yet')).toBeInTheDocument()
  })
})
