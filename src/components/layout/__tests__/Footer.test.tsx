import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import Footer from '../Footer'

vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
}))

function renderFooter() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Footer />
    </NextIntlClientProvider>
  )
}

describe('Footer', () => {
  it('renders brand name', () => {
    renderFooter()
    expect(screen.getByText('55CANDLES')).toBeInTheDocument()
  })

  it('renders Instagram link', () => {
    renderFooter()
    expect(screen.getByRole('link', { name: /instagram/i })).toBeInTheDocument()
  })

  it('renders copyright notice', () => {
    renderFooter()
    expect(screen.getByText(/all rights reserved/i)).toBeInTheDocument()
  })
})
