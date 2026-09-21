import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { POST } from '../route'

const valid = {
  name: 'Мария Петрова',
  email: 'maria@example.com',
  message: 'Здравейте, интересувам се от свещите с череши.',
}

/**
 * Each test gets a distinct client IP: the route's rate limiter is
 * module-level in-process state that persists across tests in a file.
 */
let ipCounter = 0

function post(body: unknown, ip?: string) {
  ipCounter += 1

  return POST(
    new Request('http://localhost/api/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': ip ?? `10.0.0.${ipCounter}`,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )
}

describe('POST /api/contact', () => {
  beforeEach(() => {
    // The whole point of B-20 is that a lost enquiry is loud, so the route logs
    // to console.error. Silence it here and assert on it where it matters.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    delete process.env.CONTACT_EMAIL_TO
    delete process.env.EMAIL_PROVIDER_API_KEY
    delete process.env.EMAIL_FROM
  })

  /** A mailer that can reach a provider and knows where enquiries go. */
  function configure() {
    process.env.CONTACT_EMAIL_TO = 'shop@example.com'
    process.env.EMAIL_PROVIDER_API_KEY = 'test-key'
    process.env.EMAIL_FROM = 'hello@example.com'
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 503 rather than faking success when no mailer is configured', async () => {
    // This is the core B-20 regression: the form used to claim success
    // unconditionally and destroy the enquiry.
    const response = await post(valid)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'unconfigured' })
  })

  it('logs loudly when an enquiry cannot be delivered', async () => {
    await post(valid)

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('no email provider is configured')
    )
  })

  it('never reports ok while unconfigured', async () => {
    const response = await post(valid)
    const body = await response.json()

    expect(body.ok).toBeUndefined()
    expect(response.ok).toBe(false)
  })

  it('rejects malformed JSON with 400', async () => {
    const response = await post('{ not json')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'malformed' })
  })

  it('returns per-field validation errors with 400', async () => {
    const response = await post({ name: '', email: 'bad', message: 'short' })

    expect(response.status).toBe(400)

    const body = await response.json()
    expect(body.error).toBe('validation')
    expect(body.fields).toEqual({ name: 'tooShort', email: 'invalid', message: 'tooShort' })
  })

  it('validates before checking the mailer, so bad input is not a 503', async () => {
    const response = await post({ name: '', email: '', message: '' })

    expect(response.status).toBe(400)
  })

  it('absorbs a honeypot submission with a silent 200 and no send', async () => {
    // A bot that sees an error retunes; one that sees success does not.
    const response = await post({ ...valid, website: 'http://spam.example' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(console.error).not.toHaveBeenCalled()
  })

  it('rate-limits a burst from one client', async () => {
    const ip = '203.0.113.99'
    const statuses: number[] = []

    for (let i = 0; i < 7; i += 1) {
      statuses.push((await post(valid, ip)).status)
    }

    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0)
    // The limit is 5 per window, so the first five must not be throttled.
    expect(statuses.slice(0, 5)).not.toContain(429)
  })

  it('does not rate-limit distinct clients', async () => {
    const first = await post(valid, '198.51.100.1')
    const second = await post(valid, '198.51.100.2')

    expect(first.status).not.toBe(429)
    expect(second.status).not.toBe(429)
  })

  it('returns 502 when the provider is configured but refuses the message', async () => {
    configure()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"message":"domain not verified"}', { status: 403 })
    )

    const response = await post(valid)

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: 'failed' })
  })

  it('returns 503 rather than sending to nobody when no recipient is configured', async () => {
    // An API key without CONTACT_EMAIL_TO is a mailer that can send and has
    // nowhere to send to. That must be the honest 503, not a 200.
    process.env.EMAIL_PROVIDER_API_KEY = 'test-key'
    process.env.EMAIL_FROM = 'orders@example.com'
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const response = await post(valid)

    expect(response.status).toBe(503)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('emails the enquiry to the shop, with the enquirer as reply-to', async () => {
    configure()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg_1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const response = await post(valid)

    expect(response.status).toBe(200)

    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body))
    expect(body.to).toEqual(['shop@example.com'])
    expect(body.reply_to).toBe(valid.email)
    expect(body.text).toContain(valid.message)
  })

  it('delivers one enquiry to every configured mailbox', async () => {
    // Two people run the shop, and an enquiry only one of them sees is an enquiry
    // that waits for them to be at a computer.
    configure()
    process.env.CONTACT_EMAIL_TO = 'one@example.com, two@example.com'
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ id: 'msg_1' }, { status: 200 }))

    const response = await post(valid)

    expect(response.status).toBe(200)
    // One send, two recipients — not two sends.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body))
    expect(body.to).toEqual(['one@example.com', 'two@example.com'])
  })
})
