import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { CartProvider } from '@/components/cart/CartProvider'
import messages from '../../../../messages/en.json'
import Navbar from '../Navbar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
}))
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

function renderNavbar() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}><CartProvider><Navbar /></CartProvider></NextIntlClientProvider>
  )
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /open menu/i }))
  return screen.getByRole('dialog')
}

describe('Navbar mobile menu', () => {
  it('is closed initially and the trigger reports collapsed', () => {
    renderNavbar()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open menu/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it('opens as a labelled modal dialog', async () => {
    const user = userEvent.setup()
    renderNavbar()
    const dialog = await openMenu(user)

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName(/main menu/i)
  })

  it('gives the close button an accessible name', async () => {
    const user = userEvent.setup()
    renderNavbar()
    await openMenu(user)

    expect(screen.getByRole('button', { name: /close menu/i })).toBeInTheDocument()
  })

  it('moves focus into the dialog on open', async () => {
    const user = userEvent.setup()
    renderNavbar()
    const dialog = await openMenu(user)

    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  // AnimatePresence keeps the dialog mounted for the duration of its exit
  // animation, so these assertions must wait rather than sample immediately.
  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderNavbar()
    await openMenu(user)

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('locks body scroll while open and restores it on close', async () => {
    const user = userEvent.setup()
    renderNavbar()
    await openMenu(user)
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'))
  })

  it('returns focus to the trigger after closing', async () => {
    const user = userEvent.setup()
    renderNavbar()
    const trigger = screen.getByRole('button', { name: /open menu/i })
    await openMenu(user)

    await user.keyboard('{Escape}')

    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('keeps Tab inside the dialog', async () => {
    const user = userEvent.setup()
    renderNavbar()
    const dialog = await openMenu(user)

    // Walk well past the number of focusable children; focus must never
    // escape to the page behind.
    for (let i = 0; i < 15; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })
})
