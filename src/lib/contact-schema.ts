/**
 * Validation for the contact form (AUDIT.md B-20).
 *
 * Hand-rolled rather than pulling in a schema library: this is the only
 * user-submitted payload on the site today, and the rules are simple enough
 * that a dependency would cost more than it saves. Revisit when checkout adds
 * address and order payloads — at that point a shared schema library earns its
 * place.
 *
 * Runs on the server. The client does its own HTML-level validation for
 * feedback, but that is a convenience and is not trusted.
 */

export interface ContactSubmission {
  name: string
  email: string
  message: string
}

export type ContactField = keyof ContactSubmission

export const LIMITS = {
  name: { min: 2, max: 100 },
  email: { max: 254 },
  message: { min: 10, max: 5000 },
} as const

/**
 * Deliberately permissive. Rejecting technically-valid addresses loses real
 * enquiries, and the only authoritative test of an address is delivery to it.
 * This catches typos and obvious junk, nothing more.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

export type ValidationErrors = Partial<Record<ContactField, string>>

export function validateContact(input: unknown): {
  ok: boolean
  data?: ContactSubmission
  errors: ValidationErrors
} {
  const errors: ValidationErrors = {}

  if (typeof input !== 'object' || input === null) {
    return { ok: false, errors: { message: 'invalid' } }
  }

  const raw = input as Record<string, unknown>

  const asString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

  const name = asString(raw.name)
  const email = asString(raw.email)
  const message = asString(raw.message)

  if (name.length < LIMITS.name.min) errors.name = 'tooShort'
  else if (name.length > LIMITS.name.max) errors.name = 'tooLong'

  if (email.length === 0) errors.email = 'required'
  else if (email.length > LIMITS.email.max) errors.email = 'tooLong'
  else if (!EMAIL.test(email)) errors.email = 'invalid'

  if (message.length < LIMITS.message.min) errors.message = 'tooShort'
  else if (message.length > LIMITS.message.max) errors.message = 'tooLong'

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return { ok: true, data: { name, email, message }, errors: {} }
}

/**
 * Bots fill every field they find. A field hidden from humans that arrives
 * populated is a bot, and rejecting it silently — with a 200 — means the bot
 * cannot tell it failed and retune. Real users never see the field.
 */
export const HONEYPOT_FIELD = 'website'

export function looksAutomated(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false
  const value = (raw as Record<string, unknown>)[HONEYPOT_FIELD]
  return typeof value === 'string' && value.trim().length > 0
}
