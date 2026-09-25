/**
 * The company a customer wants the фактура made out to, asked for at checkout.
 *
 * Optional and off by default: most orders are a person buying a candle, and
 * they never see these fields. A customer who ticks "invoice to a company" is
 * asked for what the invoice prints — фирма, ЕИК, registered address — and,
 * optionally, a ДДС number and an МОЛ.
 *
 * Nothing is issued at checkout. The details are stored on the order and fill
 * the admin's invoice form, which is still where a фактура is issued, by hand:
 * the numbers belong to a series that may not have gaps, so a stray or spam
 * order must never consume one.
 *
 * Shared by the client form and the server action, like `delivery-schema.ts`,
 * and for the same reason — the server's copy is the one that counts.
 */

export const BILLING_LIMITS = {
  company: { min: 2, max: 200 },
  // 200, the admin invoice form's own limit, so a stored address always fits it.
  address: { min: 5, max: 200 },
  accountable: { max: 100 },
} as const

export interface BillingDetails {
  /** Фирма, as registered. */
  company: string
  /** ЕИК/Булстат: 9 digits, or 13 for a branch. Checksum-verified. */
  eik: string
  /** ДДС номер, `BG` and 9–10 digits, or empty. */
  vatNumber: string
  /** Седалище и адрес на управление — the registered address, not the delivery one. */
  address: string
  /** Материално отговорно лице, or empty. */
  accountable: string
}

/** The form's field names, prefixed so they cannot collide with the delivery's. */
export type BillingField =
  'invoiceCompany' | 'invoiceEik' | 'invoiceVatNumber' | 'invoiceAddress' | 'invoiceAccountable'

export type BillingErrors = Partial<Record<BillingField, string>>

export type BillingResult =
  /** The box was not ticked. Whatever the fields hold is ignored. */
  | { requested: false; valid: true; errors: BillingErrors; value: null }
  | { requested: true; valid: boolean; errors: BillingErrors; value: BillingDetails }

/**
 * Whether a ЕИК/Булстат is one the register could have issued.
 *
 * The last digit is a check digit (Наредба за регистър БУЛСТАТ): weights 1–8
 * over the first eight digits, mod 11, retried with weights 3–10 when that
 * gives 10, and 10 again means 0. A 13-digit code — a branch — must have a
 * valid 9-digit root and a second check digit over digits 9–12, weights
 * 2, 7, 3, 5 and then 4, 9, 5, 7.
 *
 * It catches a mistyped or transposed digit, which is the mistake a customer
 * copying a number off a document actually makes. It cannot tell whether the
 * company exists.
 */
export function isValidEik(eik: string): boolean {
  if (!/^(\d{9}|\d{13})$/.test(eik)) return false

  const digits = [...eik].map(Number)

  const check = (values: number[], first: number[], second: number[]): number => {
    const sum = (weights: number[]) =>
      values.reduce((total, digit, index) => total + digit * weights[index], 0) % 11
    const once = sum(first)
    if (once !== 10) return once
    const twice = sum(second)
    return twice === 10 ? 0 : twice
  }

  const root = check(digits.slice(0, 8), [1, 2, 3, 4, 5, 6, 7, 8], [3, 4, 5, 6, 7, 8, 9, 10])
  if (root !== digits[8]) return false
  if (digits.length === 9) return true

  return check(digits.slice(8, 12), [2, 7, 3, 5], [4, 9, 5, 7]) === digits[12]
}

/**
 * A ДДС number in its canonical form: upper case, no spaces, `BG` in front.
 *
 * A bare run of digits gets the prefix, because customers often type the number
 * the way it is spoken — without the country.
 */
export function normaliseVatNumber(raw: string): string {
  const compact = raw.replace(/[\s.-]/g, '').toUpperCase()
  return /^\d+$/.test(compact) ? `BG${compact}` : compact
}

const VAT_NUMBER = /^BG\d{9,10}$/

/** True for the checkbox's own value, and for nothing a hand-built POST might guess. */
function ticked(value: unknown): boolean {
  return value === 'on' || value === 'true' || value === '1'
}

export function validateBilling(input: Partial<Record<string, unknown>>): BillingResult {
  if (!ticked(input.wantsInvoice)) {
    return { requested: false, valid: true, errors: {}, value: null }
  }

  const str = (key: BillingField): string =>
    typeof input[key] === 'string' ? (input[key] as string).trim() : ''

  const value: BillingDetails = {
    company: str('invoiceCompany'),
    // Spaces are how an ЕИК is often printed ("208 907 603"); they are not part
    // of it.
    eik: str('invoiceEik').replace(/\s/g, ''),
    vatNumber: str('invoiceVatNumber') ? normaliseVatNumber(str('invoiceVatNumber')) : '',
    address: str('invoiceAddress'),
    accountable: str('invoiceAccountable'),
  }

  const errors: BillingErrors = {}

  if (value.company.length < BILLING_LIMITS.company.min) {
    errors.invoiceCompany = 'required'
  } else if (value.company.length > BILLING_LIMITS.company.max) {
    errors.invoiceCompany = 'tooLong'
  }

  if (!value.eik) {
    errors.invoiceEik = 'required'
  } else if (!isValidEik(value.eik)) {
    errors.invoiceEik = 'invalid'
  }

  if (value.vatNumber && !VAT_NUMBER.test(value.vatNumber)) {
    errors.invoiceVatNumber = 'invalid'
  }

  if (value.address.length < BILLING_LIMITS.address.min) {
    errors.invoiceAddress = 'required'
  } else if (value.address.length > BILLING_LIMITS.address.max) {
    errors.invoiceAddress = 'tooLong'
  }

  if (value.accountable.length > BILLING_LIMITS.accountable.max) {
    errors.invoiceAccountable = 'tooLong'
  }

  return { requested: true, valid: Object.keys(errors).length === 0, errors, value }
}
