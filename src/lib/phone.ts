/**
 * Bulgarian phone numbers (AUDIT.md Q-25).
 *
 * The phone number is the single most load-bearing field in the delivery form.
 * Everything after checkout runs through it: Econt and Speedy both send the
 * "your parcel is on its way" and "your parcel is waiting at the office" SMS to
 * this number, the courier phones it when nobody answers the door, and an
 * uncollected parcel comes back to us at our own cost. A wrong digit is not a
 * cosmetic problem — it is a parcel the customer never hears about.
 *
 * So this is one of the few fields where being strict is right. The rest of the
 * form is deliberately loose (see `delivery-schema.ts`) because addresses are
 * written many valid ways; a Bulgarian mobile number, by contrast, has exactly
 * one shape, and every wrong shape is a number that cannot be reached.
 *
 * ## What is accepted
 *
 * The number, in any form a Bulgarian would actually type it:
 *
 *     0887 115 957     +359 887 115 957     00359 887 115 957
 *     0887115957       +359887115957        (0887) 115-957
 *
 * All of them normalise to one canonical `+359887115957`, which is what gets
 * stored and handed to the courier. One format in the database means one format
 * for the SMS gateway, and no "is this the same customer" guessing later.
 *
 * ## Why mobile only
 *
 * A landline cannot receive an SMS, and the SMS *is* the notification. Both
 * couriers' own checkouts ask for a mobile for the same reason. A customer
 * giving `02 123 4567` gets told why rather than being silently accepted into a
 * delivery they will never be told about — the message names the problem, so if
 * the shop ever decides a callable landline is good enough, this is the one
 * place to relax.
 *
 * ## Where the patterns come from
 *
 * Google's libphonenumber metadata for country code 359 (via
 * `libphonenumber-js@1.13.13`, `metadata.full.json`), transcribed rather than
 * invented, and rather than adding a 145 kB dependency to validate one field.
 * Bulgaria's plan is stable, but if these ever need refreshing, that is the
 * source: `countries.BG` → mobile is entry 1 of the type array, fixed line
 * entry 0.
 */

/**
 * The shape to show in the field, as a placeholder.
 *
 * Deliberately *not* a translated string: it is nine digits, identical on the
 * Bulgarian and English pages, so putting it in the catalogues bought two copies
 * to keep in step and one more key that throws `MISSING_MESSAGE` if either copy
 * is missed. The prose around it in `checkout.error.phone.*` is translated,
 * because that is prose.
 */
export const PHONE_EXAMPLE = '0888 123 456'

/**
 * Why a number was rejected. Every one needs a message under
 * `checkout.error.phone` in *both* catalogues, or the field throws
 * `MISSING_MESSAGE` at the moment a customer makes that particular mistake —
 * which is to say, in production, on the one path nobody clicked through.
 * A list rather than a bare union so `phone.test.ts` can check all six.
 */
export const PHONE_PROBLEMS = [
  /** Empty. Reported separately from malformed: it is a different mistake. */
  'required',
  /** Not a phone number at all, or no plausible Bulgarian number. */
  'invalid',
  /** A real number in another country's plan. We only deliver in Bulgaria. */
  'notBulgarian',
  /** A valid Bulgarian landline, premium or toll-free number. Cannot take SMS. */
  'notMobile',
  'tooShort',
  'tooLong',
] as const

export type PhoneProblem = (typeof PHONE_PROBLEMS)[number]

export type PhoneCheck =
  /** `+359887115957`. Store this, not what was typed. */
  | { ok: true; e164: string }
  | { ok: false; problem: PhoneProblem }

/**
 * Characters a person might put between the digits: spaces, dashes, brackets,
 * dots, slashes (`02/123 4567` is a common Bulgarian habit) and a leading `+`.
 * Anything else — a letter, an extension marker — means this is not a number we
 * can dial, and guessing which digits were meant is worse than asking.
 */
const SEPARATORS = /^[\d\s+()./-]+$/

/**
 * Bulgarian mobile ranges, as national significant numbers (no trunk `0`):
 *
 * - `87x`, `88x`, `89x` — A1, Yettel, Vivacom. Nine digits. Virtually everyone.
 * - `98x` — nine digits, also mobile.
 * - `996`, `999` — nine digits.
 * - `430`, `437`–`439` — eight digits.
 */
const MOBILE = /^(?:43[07-9]\d{5}|99[69]\d{6}|(?:8[7-9]|98)\d{7})$/

/**
 * The start of a mobile range, used only to tell "you mistyped a mobile number"
 * from "that is not a mobile number". `43[1-6]` is deliberately absent — those
 * are landlines in the same block.
 */
const MOBILE_RANGE = /^(?:8[7-9]|98|99[69]|43[07-9])/

/**
 * Everything else in the Bulgarian plan: landlines (Sofia is `2`, the rest are
 * two-to-four digit area codes), `0800` toll-free, `090` premium, `0700`
 * service numbers. Matching one earns the specific "that is not a mobile"
 * message; matching nothing at all earns "that is not a phone number".
 */
const NON_MOBILE =
  /^(?:2\d{5,7}|(?:43[1-6]|70[1-9])\d{4,5}|(?:[36]\d|4[124-7]|[57][1-9]|8[1-6]|9[1-7])\d{5,6}|800\d{5}|90\d{6}|700\d{5})$/

const COUNTRY_CODE = '359'

/**
 * Strip the trunk prefix. Also tolerates `+359 0887…`, which people produce by
 * pasting a country code in front of the number they already had — the `0` is
 * a domestic dialling artefact and never part of the number itself.
 */
function withoutTrunk(nsn: string): string {
  return nsn.startsWith('0') ? nsn.slice(1) : nsn
}

/**
 * The national significant number, or `null` for another country.
 *
 * `+359…` and `00359…` are unambiguous. A bare `359…` is only read as a country
 * code when it is too long to be anything else: `0359 12345` is a real
 * Bulgarian area code (Nikolaevo), so stripping a leading `359` from a national
 * number would quietly mangle it.
 */
function nationalNumber(digits: string, explicitPlus: boolean): string | null {
  if (digits.startsWith(`00${COUNTRY_CODE}`)) return withoutTrunk(digits.slice(5))
  if (digits.startsWith(COUNTRY_CODE) && (explicitPlus || digits.length >= 11)) {
    return withoutTrunk(digits.slice(3))
  }

  // `+` or `00` with any other country code: a number we cannot deliver to.
  if (explicitPlus || digits.startsWith('00')) return null

  return withoutTrunk(digits)
}

/** How long a number in this mobile range should be. */
function expectedLength(nsn: string): number {
  return nsn.startsWith('43') ? 8 : 9
}

/**
 * Validate and canonicalise. The single source of truth for both the form's
 * as-you-go check and the server action's, so the two cannot disagree about
 * what a valid number is.
 */
export function normaliseBulgarianPhone(input: string): PhoneCheck {
  const trimmed = input.trim()

  if (!trimmed) return { ok: false, problem: 'required' }
  if (!SEPARATORS.test(trimmed)) return { ok: false, problem: 'invalid' }

  // A `+` anywhere but the front is not a country code, it is a typo.
  if (trimmed.lastIndexOf('+') > 0) return { ok: false, problem: 'invalid' }

  const digits = trimmed.replace(/\D/g, '')
  const nsn = nationalNumber(digits, trimmed.startsWith('+'))

  if (nsn === null) return { ok: false, problem: 'notBulgarian' }

  if (MOBILE.test(nsn)) return { ok: true, e164: `+${COUNTRY_CODE}${nsn}` }

  if (MOBILE_RANGE.test(nsn)) {
    return { ok: false, problem: nsn.length < expectedLength(nsn) ? 'tooShort' : 'tooLong' }
  }

  if (NON_MOBILE.test(nsn)) return { ok: false, problem: 'notMobile' }

  return { ok: false, problem: 'invalid' }
}

/**
 * The problem with a number, or `null` if there is none — for the form, which
 * wants to know whether to show a message and nothing else.
 *
 * Separate from `normaliseBulgarianPhone` so the client is not tempted to use
 * its own normalised value for anything: the server recomputes it, and the
 * server's copy is the one that reaches the courier.
 */
export function phoneProblem(input: string): PhoneProblem | null {
  const result = normaliseBulgarianPhone(input)
  return result.ok ? null : result.problem
}
