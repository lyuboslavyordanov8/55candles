import { company } from '@/lib/company'
import { HONEYPOT_FIELD, looksAutomated, validateContact } from '@/lib/contact-schema'
import { contactRecipient, isMailerConfigured, sendEmail } from '@/lib/mailer'

/**
 * Contact form endpoint (AUDIT.md B-20).
 *
 * The form previously awaited a 1000 ms timeout and then unconditionally told
 * the customer "Message sent!" — including for order enquiries, which were
 * silently destroyed. This endpoint replaces that with a truthful result.
 *
 * Mail now has a provider (`src/lib/mailer.ts`), but the endpoint still refuses
 * visibly rather than faking success: with no API key, no verified sender or no
 * recipient it answers **503 `unconfigured`** and the form tells the customer to
 * phone or DM instead. That is the honest failure mode, and it is the whole
 * point — a visibly broken form loses one enquiry, a fake one loses every enquiry
 * without anyone noticing.
 *
 * Needs `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM` and `CONTACT_EMAIL_TO`.
 */

// In-process, best-effort rate limit. It resets on deploy and is per-instance,
// so it is a courtesy speed bump against a crude flood, not a security control.
// A real limiter needs shared state — revisit with B-01.
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 5
const hits = new Map<string, number[]>()

function rateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS)

  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent)
    return true
  }

  recent.push(now)
  hits.set(key, recent)

  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every((at) => now - at >= WINDOW_MS)) hits.delete(k)
    }
  }

  return false
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

export async function POST(request: Request) {
  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'malformed' }, { status: 400 })
  }

  // A 200 with no email sent: the bot sees success and does not retry or adapt.
  if (looksAutomated(payload)) {
    return Response.json({ ok: true }, { status: 200 })
  }

  if (rateLimited(clientKey(request))) {
    return Response.json({ error: 'rateLimited' }, { status: 429 })
  }

  const { ok, data, errors } = validateContact(payload)

  if (!ok || !data) {
    return Response.json({ error: 'validation', fields: errors }, { status: 400 })
  }

  const recipient = contactRecipient()

  if (!isMailerConfigured() || recipient.length === 0) {
    // Deliberately loud in the server log: this is a lost enquiry.
    console.error(
      '[contact] Enquiry received but no email provider is configured (AUDIT.md B-17). ' +
        'The customer was told delivery failed and given the phone number.'
    )
    return Response.json({ error: 'unconfigured' }, { status: 503 })
  }

  const result = await sendEmail({
    to: recipient,
    replyTo: data.email,
    subject: `55° candles enquiry from ${data.name}`,
    text: [
      `Name:    ${data.name}`,
      `Email:   ${data.email}`,
      '',
      data.message,
      '',
      `— sent from the ${company.tradingName} contact form`,
    ].join('\n'),
  })

  if (result.status === 'sent') {
    return Response.json({ ok: true }, { status: 200 })
  }

  if (result.status === 'unconfigured') {
    return Response.json({ error: 'unconfigured' }, { status: 503 })
  }

  console.error('[contact] Email provider rejected the message:', result.reason)
  return Response.json({ error: 'failed' }, { status: 502 })
}

/** The honeypot field name, so the form and the tests agree on it. */
export const __honeypot = HONEYPOT_FIELD
