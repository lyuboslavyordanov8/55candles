import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import Footer from '../Footer'

vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
  useSearchParams: () => new URLSearchParams(),
}))

function renderFooter() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Footer />
    </NextIntlClientProvider>
  )
}

describe('Footer', () => {
  // The wordmark at the top of the footer was replaced by the oversized
  // sign-off at the bottom, which now carries the brand.
  it('renders the oversized sign-off', () => {
    renderFooter()
    expect(screen.getByText(messages.footer.signOff)).toBeInTheDocument()
  })

  it('invites you to follow on social', () => {
    renderFooter()
    expect(screen.getByText(messages.footer.followUs)).toBeInTheDocument()
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
