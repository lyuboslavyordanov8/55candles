/**
 * Transactional email (AUDIT.md B-17), minimal first slice.
 *
 * No provider has been chosen yet, so there is no SDK here. What matters for
 * B-20 is the *contract*: a caller gets a truthful result, and a message is
 * never reported as delivered unless it was.
 *
 * When a provider is picked, implement `deliver` and leave the rest alone. The
 * route already handles every outcome this returns.
 */

export type SendResult =
  | { status: 'sent' }
  /** No provider configured. The caller must not claim success. */
  | { status: 'unconfigured' }
  /** Provider was reached and refused, or errored. */
  | { status: 'failed'; reason: string }

export interface OutboundEmail {
  subject: string
  /** Where enquiries land. */
  to: string
  /** The enquirer, so a reply goes to them rather than to the shop. */
  replyTo?: string
  text: string
}

/** True when enough configuration exists to actually send. */
export function isMailerConfigured(): boolean {
  return Boolean(process.env.CONTACT_EMAIL_TO && process.env.EMAIL_PROVIDER_API_KEY)
}

export async function sendEmail(email: OutboundEmail): Promise<SendResult> {
  if (!isMailerConfigured()) {
    return { status: 'unconfigured' }
  }

  try {
    // TODO(AUDIT.md B-17): call the chosen provider here. Until then
    // isMailerConfigured() is false in every environment, so this is
    // unreachable rather than silently dropping mail.
    return await deliver(email)
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'unknown',
    }
  }
}

async function deliver(_email: OutboundEmail): Promise<SendResult> {
  throw new Error(
    'No email provider implemented yet — see AUDIT.md B-17. ' +
      'isMailerConfigured() should have prevented this call.'
  )
}
