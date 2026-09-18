import { normaliseBulgarianPhone } from './phone'
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
 *
 * The phone number is the deliberate exception — see `phone.ts`. It has exactly
 * one valid shape in Bulgaria, and every other shape is a customer who never
 * gets the courier's SMS.
 */

export const LIMITS = {
  name: { min: 2, max: 100 },
  /** Phone has no length limit here: its own shape decides it. See `phone.ts`. */
  email: { max: 254 },
  city: { min: 2, max: 100 },
  postCode: { length: 4 },
  street: { min: 5, max: 200 },
  officeId: { max: 40 },
  /**
   * The office snapshot. Capped rather than validated: these are the courier's
   * own strings, echoed back by the picker, so a length problem is our data
   * problem and not something the customer can fix by editing a field they
   * never filled in. Over-long values are truncated below.
   */
  officeName: { max: 150 },
  officeAddress: { max: 250 },
  note: { max: 500 },
} as const

/**
 * Bulgarian post codes are exactly four digits. This is one of the few
 * genuinely fixed formats, and the courier APIs reject anything else, so
 * validating it here saves a round trip.
 */
const POST_CODE = /^\d{4}$/

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
  /**
   * Required for `office` and `locker`. Empty for door.
   *
   * The courier's office *code* — what goes on the waybill — not its internal
   * primary key. See `CourierOffice.id` in `src/lib/couriers/types.ts`.
   */
  officeId: string
  /**
   * Human-readable snapshot of the chosen office, filled by the picker and
   * empty when the customer typed a code into the fallback field.
   *
   * Kept because an id alone is not enough: offices close, and a closed code
   * resolves to nothing when the label is printed weeks later. `orders` has
   * matching columns — see `src/db/schema.ts`.
   */
  officeName: string
  officeAddress: string
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

/**
 * Validate and normalise. Trims before measuring length, so `'  '` is empty
 * rather than two characters long.
 */
export function validateDelivery(input: Partial<Record<string, unknown>>): ValidationResult {
  const str = (key: string): string =>
    typeof input[key] === 'string' ? (input[key] as string).trim() : ''

  /** Trimmed and capped. For our own snapshot fields, never customer input. */
  const capped = (key: string, max: number): string => str(key).slice(0, max)

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
    officeName: capped('officeName', LIMITS.officeName.max),
    officeAddress: capped('officeAddress', LIMITS.officeAddress.max),
    note: str('note'),
  }

  const errors: FieldErrors = {}

  if (value.recipientName.length < LIMITS.name.min) {
    errors.recipientName = 'tooShort'
  } else if (value.recipientName.length > LIMITS.name.max) {
    errors.recipientName = 'tooLong'
  }

  // The strictest field in the form, and the only one where that is right: the
  // courier's arrival SMS goes to this number, so an unreachable one means a
  // parcel the customer is never told about. `phone.ts` explains the rules and
  // returns a specific problem so the message can name it.
  //
  // The stored value is the canonical `+359…` form, not what was typed, so the
  // waybill and any SMS gateway see one format.
  const phone = normaliseBulgarianPhone(value.phone)
  if (phone.ok) {
    value.phone = phone.e164
  } else {
    errors.phone = phone.problem
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
