import { COURIERS, DELIVERY_METHODS, type Courier, type DeliveryMethod } from './shipping'

/**
 * Delivery details validation (AUDIT.md Q-25).
 *
 * Shared by the client form and the server action, because two
 * implementations of the same rule drift, and the server's copy is the one
 * that matters — client validation is a courtesy, never a boundary.
 *
 * The rules are deliberately loose on names and addresses. Bulgarian
 * addresses are written many valid ways (`ж.к.`, `бл.`, `вх.`, `ет.`, `ап.`),
 * transliteration is inconsistent, and an over-strict pattern rejects real
 * customers — a far worse outcome than accepting an odd-looking address a
 * human courier can still read. Only the fields a courier genuinely needs to
 * route a parcel are required.
 */

export const LIMITS = {
  name: { min: 2, max: 100 },
  phone: { min: 6, max: 20 },
  email: { max: 254 },
  city: { min: 2, max: 100 },
  postCode: { length: 4 },
  street: { min: 5, max: 200 },
  officeId: { max: 40 },
  note: { max: 500 },
} as const

/**
 * Bulgarian post codes are exactly four digits. This is one of the few
 * genuinely fixed formats, and the courier APIs reject anything else, so
 * validating it here saves a round trip.
 */
const POST_CODE = /^\d{4}$/

/**
 * Phone: digits, spaces, `+`, `-`, `(`, `)`. Not a strict national format —
 * the courier needs to be able to phone the recipient, and rejecting a
 * legitimately-formatted number loses the order. Counted on digits only, so
 * spacing cannot pad a too-short number into passing.
 */
const PHONE_ALLOWED = /^[\d\s+()-]+$/

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

export interface DeliveryDetails {
  recipientName: string
  phone: string
  /** Optional: used only to send the tracking number. */
  email: string
  courier: Courier
  method: DeliveryMethod
  city: string
  postCode: string
  /** Required for `door`. Empty for office/locker. */
  street: string
  /** Required for `office` and `locker`. Empty for door. */
  officeId: string
  /** Free-text note for the courier, e.g. "phone before delivery". */
  note: string
}

export type FieldErrors = Partial<Record<keyof DeliveryDetails, string>>

export interface ValidationResult {
  valid: boolean
  errors: FieldErrors
  /** Trimmed, normalised values — use these, not the raw input. */
  value: DeliveryDetails
}

function digitCount(value: string): number {
  return (value.match(/\d/g) ?? []).length
}

/**
 * Validate and normalise. Trims before measuring length, so `'  '` is empty
 * rather than two characters long.
 */
export function validateDelivery(input: Partial<Record<string, unknown>>): ValidationResult {
  const str = (key: string): string =>
    typeof input[key] === 'string' ? (input[key] as string).trim() : ''

  const value: DeliveryDetails = {
    recipientName: str('recipientName'),
    phone: str('phone'),
    email: str('email'),
    courier: str('courier') as Courier,
    method: str('method') as DeliveryMethod,
    city: str('city'),
    postCode: str('postCode'),
    street: str('street'),
    officeId: str('officeId'),
    note: str('note'),
  }

  const errors: FieldErrors = {}

  if (value.recipientName.length < LIMITS.name.min) {
    errors.recipientName = 'tooShort'
  } else if (value.recipientName.length > LIMITS.name.max) {
    errors.recipientName = 'tooLong'
  }

  // Character set is checked before length: for '0887 CALL ME' both rules fail,
  // and "that isn't a phone number" is more use to the customer than "too
  // short", which invites them to add more letters. Empty is reported as
  // missing rather than malformed, which is what it is.
  if (!value.phone) {
    errors.phone = 'required'
  } else if (!PHONE_ALLOWED.test(value.phone)) {
    errors.phone = 'invalid'
  } else if (digitCount(value.phone) < LIMITS.phone.min) {
    errors.phone = 'tooShort'
  } else if (value.phone.length > LIMITS.phone.max) {
    errors.phone = 'tooLong'
  }

  // Email is optional — a COD customer collecting from an office may not have
  // one, and demanding it loses the order. Validated only when supplied.
  if (value.email) {
    if (value.email.length > LIMITS.email.max) {
      errors.email = 'tooLong'
    } else if (!EMAIL.test(value.email)) {
      errors.email = 'invalid'
    }
  }

  if (!(COURIERS as readonly string[]).includes(value.courier)) {
    errors.courier = 'invalid'
  }

  if (!(DELIVERY_METHODS as readonly string[]).includes(value.method)) {
    errors.method = 'invalid'
  }

  if (value.city.length < LIMITS.city.min) {
    errors.city = 'required'
  } else if (value.city.length > LIMITS.city.max) {
    errors.city = 'tooLong'
  }

  if (!POST_CODE.test(value.postCode)) {
    errors.postCode = 'invalid'
  }

  // Method decides which location field is required. Requiring both would
  // block every order; requiring neither would produce an unroutable parcel.
  if (value.method === 'door') {
    if (value.street.length < LIMITS.street.min) {
      errors.street = 'required'
    } else if (value.street.length > LIMITS.street.max) {
      errors.street = 'tooLong'
    }
  } else if (value.method === 'office' || value.method === 'locker') {
    if (!value.officeId) {
      errors.officeId = 'required'
    } else if (value.officeId.length > LIMITS.officeId.max) {
      errors.officeId = 'tooLong'
    }
  }

  if (value.note.length > LIMITS.note.max) {
    errors.note = 'tooLong'
  }

  return { valid: Object.keys(errors).length === 0, errors, value }
}

/** Which fields the form should show for a method. */
export function fieldsFor(method: DeliveryMethod): Array<keyof DeliveryDetails> {
  const common: Array<keyof DeliveryDetails> = [
    'recipientName',
    'phone',
    'email',
    'city',
    'postCode',
  ]

  return method === 'door' ? [...common, 'street', 'note'] : [...common, 'officeId', 'note']
}
