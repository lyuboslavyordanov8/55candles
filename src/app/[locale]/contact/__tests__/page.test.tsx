import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../../messages/en.json'
import ContactContent from '../ContactContent'

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/contact',
}))

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ContactContent />
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
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument()
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
    await user.type(screen.getByLabelText(/your name/i), 'Alice')
    await user.type(screen.getByLabelText(/email address/i), 'alice@example.com')
    await user.type(screen.getByLabelText(/message/i), 'Hello!')
    await user.click(screen.getByRole('button', { name: /send message/i }))

    // NOTE: the form currently fakes a 1s round trip and never sends anything
    // (AUDIT.md B-20). Rewrite this against the real endpoint once it exists.
    expect(
      await screen.findByText(new RegExp(messages.contact.success, 'i'), undefined, {
        timeout: 3000,
      })
    ).toBeInTheDocument()
  })
})
