/**
 * Transactional email (AUDIT.md B-17).
 *
 * One provider, reached over its HTTP API with `fetch` — no SDK, because a
 * single POST does not need one and a dependency here would be a dependency in
 * the serverless bundle of every route that sends mail.
 *
 * The contract has not changed and is still the load-bearing part: a caller gets
 * a truthful result, and a message is never reported as delivered unless the
 * provider said it accepted it. Everything above this module (the contact form,
 * the order confirmation) is written against `SendResult`, so a provider swap is
 * confined to `deliver`.
 *
 * ## Configuration
 *
 * | Variable                  | What it is                                        |
 * | ------------------------- | ------------------------------------------------- |
 * | `EMAIL_PROVIDER_API_KEY`  | Resend API key (`re_…`).                          |
 * | `EMAIL_FROM`              | Verified sender, e.g. `55° candles <orders@…>`.   |
 * | `CONTACT_EMAIL_TO`        | Where contact-form enquiries land. Comma-separated |
 * |                           | for several mailboxes.                            |
 * | `ORDER_EMAIL_TO`          | Where new orders are announced. Falls back to     |
 * |                           | `CONTACT_EMAIL_TO`.                               |
 *
 * `EMAIL_FROM` has to be on a domain verified with the provider. Sending from an
 * unverified domain is refused by the provider, which surfaces here as `failed`
 * rather than as silence — see `deliver`.
 */

export type SendResult =
  | { status: 'sent'; id?: string }
  /** No provider configured. The caller must not claim success. */
  | { status: 'unconfigured' }
  /** Provider was reached and refused, or errored. */
  | { status: 'failed'; reason: string }

export interface OutboundEmail {
  subject: string
  /** One recipient or several. */
  to: string | readonly string[]
  /**
   * Where a reply should go, when that is not the `from` address.
   *
   * Load-bearing in both directions: on the shop's copy it is the customer, so
   * answering the notification answers them; on the customer's copy it is the
   * shop's monitored mailbox, because `from` is a send-only address and a reply
   * to it would vanish.
   */
  replyTo?: string | readonly string[]
  /** Always present. The HTML part is optional; a text-only email is valid. */
  text: string
  html?: string
}

/** Resend's send endpoint. */
const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/**
 * How long to wait for the provider.
 *
 * Bounded because order confirmation is sent inside the checkout request: a
 * provider that hangs must not hold the customer on a spinner after their order
 * is already stored. Failing the email is recoverable (the order is in the
 * database and the shop is notified separately); failing to answer is not.
 */
const TIMEOUT_MS = 10_000

/** True when enough configuration exists to actually send. */
export function isMailerConfigured(): boolean {
  return Boolean(process.env.EMAIL_PROVIDER_API_KEY && process.env.EMAIL_FROM)
}

/**
 * Split a configured recipient list into addresses.
 *
 * A list rather than a single address because the shop is run by more than one
 * person, and "who gets told about an order" is exactly the setting that should
 * not require a code change. Commas and semicolons both separate, because both
 * are what people type; blanks are dropped, so a trailing comma is harmless.
 */
function recipients(value: string | undefined): readonly string[] {
  if (!value) return []
  return value
    .split(/[,;]/)
    .map((address) => address.trim())
    .filter(Boolean)
}

/** Where contact-form enquiries go. Empty when nobody has said. */
export function contactRecipient(): readonly string[] {
  return recipients(process.env.CONTACT_EMAIL_TO)
}

/**
 * Where new orders are announced.
 *
 * Falls back to the contact addresses: a shop with one mailbox should not have to
 * set the same value twice, and an order notification with no recipient is an
 * order nobody packs.
 */
export function orderRecipient(): readonly string[] {
  const own = recipients(process.env.ORDER_EMAIL_TO)
  return own.length ? own : contactRecipient()
}

export async function sendEmail(email: OutboundEmail): Promise<SendResult> {
  if (!isMailerConfigured()) {
    return { status: 'unconfigured' }
  }

  try {
    return await deliver(email)
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'unknown',
    }
  }
}

async function deliver(email: OutboundEmail): Promise<SendResult> {
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.EMAIL_PROVIDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: Array.isArray(email.to) ? [...email.to] : [email.to],
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
      ...(email.replyTo?.length
        ? { reply_to: Array.isArray(email.replyTo) ? [...email.replyTo] : email.replyTo }
        : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  if (!response.ok) {
    // The body carries the reason — an unverified sending domain, a malformed
    // address, a revoked key — and it is the only thing that makes the failure
    // fixable, so it is reported rather than reduced to a status code. Capped
    // because a provider is free to answer with an HTML error page.
    const body = await response.text().catch(() => '')
    return {
      status: 'failed',
      reason: `${response.status} ${response.statusText}${body ? `: ${body.slice(0, 500)}` : ''}`,
    }
  }

  // Resend answers `{ id }`. The id is worth keeping — it is what a support
  // question about a missing confirmation is looked up by — but a 2xx is the
  // acceptance, so a body that will not parse does not turn a delivered message
  // into a failure.
  const id = await response
    .json()
    .then((payload: unknown) =>
      payload && typeof payload === 'object' && typeof (payload as { id?: unknown }).id === 'string'
        ? (payload as { id: string }).id
        : undefined
    )
    .catch(() => undefined)

  return id ? { status: 'sent', id } : { status: 'sent' }
}
