import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../../messages/en.json'
import ContactPage from '../page'

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/contact',
}))

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ContactPage />
    </NextIntlClientProvider>
  )
}

describe('ContactPage', () => {
  it('renders page title', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /get in touch/i })).toBeInTheDocument()
  })

  it('renders name, email and message fields', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/your name/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/email address/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument()
  })

  it('renders send button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
  })

  it('renders Instagram link', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /instagram/i })).toBeInTheDocument()
  })
})
