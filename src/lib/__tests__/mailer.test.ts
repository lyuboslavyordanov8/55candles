import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  contactRecipient,
  isMailerConfigured,
  orderRecipient,
  sendEmail,
} from '@/lib/mailer'

/**
 * The mailer (AUDIT.md B-17).
 *
 * The property under test is the one every caller depends on: **`sent` means the
 * provider accepted it.** A mailer that reports success on a 4xx is worse than no
 * mailer at all, because the shop stops checking.
 *
 * `fetch` is stubbed rather than hitting Resend: the assertions are about the
 * request built and the response interpreted, not about Resend being up.
 */

function okResponse(body: unknown = { id: 'msg_1' }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('mailer', () => {
  beforeEach(() => {
    delete process.env.EMAIL_PROVIDER_API_KEY
    delete process.env.EMAIL_FROM
    delete process.env.CONTACT_EMAIL_TO
    delete process.env.ORDER_EMAIL_TO
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function configure() {
    process.env.EMAIL_PROVIDER_API_KEY = 're_test'
    process.env.EMAIL_FROM = '55° candles <orders@example.com>'
  }

  it('is unconfigured without an api key and a sender', () => {
    expect(isMailerConfigured()).toBe(false)

    process.env.EMAIL_PROVIDER_API_KEY = 're_test'
    expect(isMailerConfigured()).toBe(false)

    process.env.EMAIL_FROM = 'orders@example.com'
    expect(isMailerConfigured()).toBe(true)
  })

  it('never sends, and never claims to, while unconfigured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(sendEmail({ to: 'a@example.com', subject: 's', text: 't' })).resolves.toEqual({
      status: 'unconfigured',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('posts the message to the provider and reports the id', async () => {
    configure()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse())

    const result = await sendEmail({
      to: 'customer@example.com',
      replyTo: 'shop@example.com',
      subject: 'Поръчка 55C-2026-000001',
      text: 'text part',
      html: '<p>html part</p>',
    })

    expect(result).toEqual({ status: 'sent', id: 'msg_1' })

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test')

    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      from: '55° candles <orders@example.com>',
      to: ['customer@example.com'],
      subject: 'Поръчка 55C-2026-000001',
      text: 'text part',
      html: '<p>html part</p>',
      reply_to: 'shop@example.com',
    })
  })

  it('accepts several recipients', async () => {
    configure()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse())

    await sendEmail({ to: ['a@example.com', 'b@example.com'], subject: 's', text: 't' })

    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body))
    expect(body.to).toEqual(['a@example.com', 'b@example.com'])
  })

  it('reports a rejection as failed, with the provider’s reason', async () => {
    configure()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"message":"The example.com domain is not verified"}', {
        status: 403,
        statusText: 'Forbidden',
      })
    )

    const result = await sendEmail({ to: 'a@example.com', subject: 's', text: 't' })

    expect(result.status).toBe('failed')
    expect(result).toMatchObject({
      reason: expect.stringContaining('domain is not verified'),
    })
  })

  it('reports a network error as failed rather than throwing', async () => {
    configure()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('socket hang up'))

    await expect(sendEmail({ to: 'a@example.com', subject: 's', text: 't' })).resolves.toEqual({
      status: 'failed',
      reason: 'socket hang up',
    })
  })

  it('still counts a 2xx with an unreadable body as sent', async () => {
    // The acceptance is the status code. A body we cannot parse is our problem,
    // not a reason to tell the shop an accepted message failed.
    configure()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json', { status: 200 }))

    await expect(sendEmail({ to: 'a@example.com', subject: 's', text: 't' })).resolves.toEqual({
      status: 'sent',
    })
  })

  it('falls back to the contact address for order notifications', () => {
    expect(orderRecipient()).toEqual([])

    process.env.CONTACT_EMAIL_TO = 'hello@example.com'
    expect(contactRecipient()).toEqual(['hello@example.com'])
    expect(orderRecipient()).toEqual(['hello@example.com'])

    process.env.ORDER_EMAIL_TO = 'orders@example.com'
    expect(orderRecipient()).toEqual(['orders@example.com'])
    // The contact address is unchanged by it: enquiries and orders may go to
    // different mailboxes.
    expect(contactRecipient()).toEqual(['hello@example.com'])
  })

  it('reads several mailboxes from one variable', () => {
    // The shop is two people. Separators and stray whitespace are what a human
    // types into a Vercel env field, so both are tolerated rather than producing
    // an address with a leading space that the provider then rejects.
    process.env.CONTACT_EMAIL_TO = 'one@example.com, two@example.com ;  '
    expect(contactRecipient()).toEqual(['one@example.com', 'two@example.com'])
    expect(orderRecipient()).toEqual(['one@example.com', 'two@example.com'])
  })

  it('sends to every configured mailbox', async () => {
    configure()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ id: 'id-1' }, { status: 200 }))

    await sendEmail({ to: ['one@example.com', 'two@example.com'], subject: 's', text: 't' })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.to).toEqual(['one@example.com', 'two@example.com'])
  })
})
