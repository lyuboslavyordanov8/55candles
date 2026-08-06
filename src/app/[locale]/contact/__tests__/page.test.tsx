import { describe, it, expect, afterEach, vi } from 'vitest'
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

/** Stub /api/contact with a given status and body. */
function mockFetch(status: number, body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/your name/i), 'Alice')
  await user.type(screen.getByLabelText(/email address/i), 'alice@example.com')
  await user.type(screen.getByLabelText(/^message$/i), 'Hello, I have a question.')
  await user.click(screen.getByRole('button', { name: /send message/i }))
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

  describe('submission (AUDIT.md B-20)', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('posts the form to the API rather than faking a round trip', async () => {
      const user = userEvent.setup()
      const fetchMock = mockFetch(200, { ok: true })
      renderPage()

      await fillAndSubmit(user)

      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('/api/contact')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toMatchObject({
        name: 'Alice',
        email: 'alice@example.com',
      })
    })

    it('confirms success only when the server accepted the message', async () => {
      const user = userEvent.setup()
      mockFetch(200, { ok: true })
      renderPage()

      await fillAndSubmit(user)

      expect(
        await screen.findByText(new RegExp(messages.contact.success, 'i'))
      ).toBeInTheDocument()
    })

    it('tells the customer to phone when delivery is not configured', async () => {
      // The regression that matters: a 503 must never look like success.
      const user = userEvent.setup()
      mockFetch(503, { error: 'unconfigured' })
      renderPage()

      await fillAndSubmit(user)

      expect(await screen.findByRole('alert')).toHaveTextContent(/email isn't set up yet/i)
      expect(screen.queryByText(new RegExp(messages.contact.success, 'i'))).not.toBeInTheDocument()
    })

    it('surfaces a server failure', async () => {
      const user = userEvent.setup()
      mockFetch(502, { error: 'failed' })
      renderPage()

      await fillAndSubmit(user)

      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't send your message/i)
    })

    it('reports rate limiting distinctly', async () => {
      const user = userEvent.setup()
      mockFetch(429, { error: 'rateLimited' })
      renderPage()

      await fillAndSubmit(user)

      expect(await screen.findByRole('alert')).toHaveTextContent(/wait a minute/i)
    })

    it('shows per-field errors returned by the server', async () => {
      const user = userEvent.setup()
      mockFetch(400, { error: 'validation', fields: { email: 'invalid' } })
      renderPage()

      await fillAndSubmit(user)

      expect(await screen.findByText(/doesn't look like an email address/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/email address/i)).toHaveAttribute('aria-invalid', 'true')
    })

    it('survives a network failure without claiming success', async () => {
      const user = userEvent.setup()
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      renderPage()

      await fillAndSubmit(user)

      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't reach the server/i)
      expect(screen.queryByText(new RegExp(messages.contact.success, 'i'))).not.toBeInTheDocument()
    })
  })
})
