import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('shows success message after form submission', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByPlaceholderText(/your name/i), 'Alice')
    await user.type(screen.getByPlaceholderText(/email address/i), 'alice@example.com')
    await user.type(screen.getByPlaceholderText(/message/i), 'Hello!')
    await user.click(screen.getByRole('button', { name: /send message/i }))
    expect(screen.getByText(new RegExp(messages.contact.success, 'i'))).toBeInTheDocument()
  })
})
