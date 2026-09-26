import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { CartProvider } from '@/components/cart/CartProvider'
import messages from '../../../../messages/en.json'
import Navbar from '../Navbar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

function renderNavbar() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}><CartProvider><Navbar /></CartProvider></NextIntlClientProvider>
  )
}

describe('Navbar', () => {
  it('renders the logo, linking home', () => {
    renderNavbar()
    const logo = screen.getByRole('link', { name: /55° candles/i })
    expect(logo).toHaveAttribute('href', '/en')
  })

  it('renders the announcement bar above it', () => {
    renderNavbar()
    expect(screen.getByText(messages.announcement.slogan)).toBeInTheDocument()
  })

  it('takes turns between the slogan and the free-delivery offer', () => {
    vi.useFakeTimers()
    try {
      renderNavbar()
      const slogan = screen.getByText(messages.announcement.slogan)
      const offer = screen.getByText('Order 3 candles and delivery is on us')
      expect(slogan).toHaveAttribute('aria-hidden', 'false')
      expect(offer).toHaveAttribute('aria-hidden', 'true')

      // The slogan for two seconds…
      act(() => vi.advanceTimersByTime(2000))
      expect(slogan).toHaveAttribute('aria-hidden', 'true')
      expect(offer).toHaveAttribute('aria-hidden', 'false')

      // …the offer for five.
      act(() => vi.advanceTimersByTime(4900))
      expect(offer).toHaveAttribute('aria-hidden', 'false')
      act(() => vi.advanceTimersByTime(100))
      expect(slogan).toHaveAttribute('aria-hidden', 'false')
    } finally {
      vi.useRealTimers()
    }
  })

  // The links moved out of the bar and into the menu panel at every breakpoint,
  // so the bar itself no longer carries them — opening the menu does.
  it('renders all nav links once the menu is open', async () => {
    const user = userEvent.setup()
    renderNavbar()

    await user.click(screen.getByRole('button', { name: /open menu/i }))

    for (const name of [/home/i, /products/i, /our story/i, /candle care/i, /contact/i]) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('renders language switcher', () => {
    renderNavbar()
    expect(screen.getByText('EN')).toBeInTheDocument()
    expect(screen.getAllByText('BG').length).toBeGreaterThan(0)
  })

  // The compact phone toggle and the desktop pill are both in the markup; CSS
  // shows one. Guard the compact one specifically — it was briefly dropped
  // altogether, which left language choice reachable only from inside the menu.
  it('offers a one-tap language toggle in the header for phones', () => {
    renderNavbar()

    const toggle = screen.getByRole('link', { name: /превключи на български/i })
    expect(toggle).toHaveAttribute('href', '/bg')
    // Named for where it goes, not where you are.
    expect(toggle).toHaveTextContent('BG')
    expect(toggle.className).toContain('md:hidden')
  })

  it('keeps the language switcher in the menu panel too', async () => {
    const user = userEvent.setup()
    renderNavbar()

    const before = screen.getAllByRole('link', { name: 'BG' }).length
    await user.click(screen.getByRole('button', { name: /open menu/i }))
    expect(screen.getAllByRole('link', { name: 'BG' }).length).toBeGreaterThan(before)
  })

  // The cart is a drawer, not a page, so this is a button. It was a link to
  // /checkout before the cart existed.
  it('puts a cart button on the right', () => {
    renderNavbar()
    expect(screen.getByRole('button', { name: /open cart/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /cart/i })).not.toBeInTheDocument()
  })

  it('opens search and filters the catalogue as you type', async () => {
    const user = userEvent.setup()
    renderNavbar()

    await user.click(screen.getByRole('button', { name: /^search$/i }))

    const input = screen.getByRole('searchbox')
    await user.type(input, 'espresso')

    expect(screen.getByRole('link', { name: /espresso martini/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /vanilla egg/i })).not.toBeInTheDocument()
  })

  it('tells you when a search matches nothing', async () => {
    const user = userEvent.setup()
    renderNavbar()

    await user.click(screen.getByRole('button', { name: /^search$/i }))
    await user.type(screen.getByRole('searchbox'), 'zzzz')

    expect(screen.getByText(messages.search.empty)).toBeInTheDocument()
  })
})
