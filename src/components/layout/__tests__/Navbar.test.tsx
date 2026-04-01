import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import Navbar from '../Navbar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
}))

function renderNavbar() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Navbar />
    </NextIntlClientProvider>
  )
}

describe('Navbar', () => {
  it('renders brand name', () => {
    renderNavbar()
    expect(screen.getByText('55CANDLES')).toBeInTheDocument()
  })

  it('renders all nav links', () => {
    renderNavbar()
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /products/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /our story/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /candle care/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /contact/i })).toBeInTheDocument()
  })

  it('renders language switcher', () => {
    renderNavbar()
    expect(screen.getByText('EN')).toBeInTheDocument()
    expect(screen.getByText('BG')).toBeInTheDocument()
  })
})
