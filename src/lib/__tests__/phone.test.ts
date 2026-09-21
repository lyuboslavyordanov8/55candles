import { describe, it, expect } from 'vitest'
import { normaliseBulgarianPhone, phoneProblem, PHONE_PROBLEMS } from '../phone'
import { company } from '../company'
import en from '../../../messages/en.json'
import bg from '../../../messages/bg.json'

/**
 * Bulgarian phone validation (AUDIT.md Q-25).
 *
 * Two failure modes, and both are expensive:
 *
 * - **Too loose** — an unreachable number is accepted, the courier's SMS goes
 *   nowhere, the parcel sits in an office for a week and comes back at our cost.
 * - **Too strict** — a real customer with a real number cannot check out, and
 *   nobody reports that; they just leave.
 *
 * So the accepting cases below matter as much as the rejecting ones, and they
 * are written as the customer would actually type them rather than as tidy
 * digit strings.
 */

describe('normaliseBulgarianPhone', () => {
  it('accepts every way a Bulgarian writes their own number', () => {
    for (const input of [
      '0887115957',
      '0887 115 957',
      '088 711 5957',
      '(0887) 115-957',
      '+359887115957',
      '+359 887 115 957',
      '00359 887 115 957',
      // Pasted with the country code in front of the number they already had.
      '+359 0887 115 957',
      // No trunk zero at all, which is how numbers arrive from a contact card.
      '887115957',
      '  0887 115 957  ',
    ]) {
      expect(normaliseBulgarianPhone(input), input).toEqual({
        ok: true,
        e164: '+359887115957',
      })
    }
  })

  it('accepts all three operators, and the smaller mobile ranges', () => {
    for (const input of [
      '0871 234 567', // Yettel
      '0881 234 567', // A1
      '0891 234 567', // Vivacom
      '0987 654 321', // 98x
      '0996 123 456', // 996
      '0430 12345', // eight digits, one of the 43x mobile blocks
    ]) {
      expect(phoneProblem(input), input).toBeNull()
    }
  })

  it("validates the shop's own number, whenever it publishes one again", () => {
    // Unpublished by the owner's decision, so there is nothing to check — but the
    // assertion stays: put a number back in `company.ts` and this guards it, so
    // the site cannot start advertising a number these rules would reject.
    if (company.contact.phone === null) return
    expect(phoneProblem(company.contact.phone)).toBeNull()
  })

  it('reports an empty field as missing, not as malformed', () => {
    // Different mistake, different message: one is "you forgot", the other is
    // "you typed something that cannot be dialled".
    expect(phoneProblem('')).toBe('required')
    expect(phoneProblem('   ')).toBe('required')
  })

  it('rejects anything that is not a number', () => {
    for (const input of ['0887 CALL ME', 'ask me', '0887 115 957 ext 2', '0887+115957']) {
      expect(phoneProblem(input), input).toBe('invalid')
    }
  })

  it('names a landline as a landline, since the notification is an SMS', () => {
    for (const input of [
      '02 123 4567', // Sofia
      '032 123 456', // Plovdiv
      '(02) 123-4567',
      '0431 2345', // the landline half of the 43x block
      '0900 12345', // premium rate
      '0700 12345', // service number
    ]) {
      expect(phoneProblem(input), input).toBe('notMobile')
    }
  })

  it('rejects another country politely, and specifically', () => {
    // Real numbers, just not ones we deliver to. Worth its own message: "that
    // is not a phone number" would look like a bug to the person typing it.
    for (const input of ['+44 7700 900123', '+49 170 1234567', '0040 721 234 567']) {
      expect(phoneProblem(input), input).toBe('notBulgarian')
    }
  })

  it('distinguishes a mistyped mobile from an impossible one', () => {
    // A digit short or a digit over is a typo, and saying so is far more use
    // than "that is not a number".
    expect(phoneProblem('0887 115 95')).toBe('tooShort')
    expect(phoneProblem('+359 887 115 95')).toBe('tooShort')
    expect(phoneProblem('0887 115 9571')).toBe('tooLong')
    expect(phoneProblem('+359 887 115 9571')).toBe('tooLong')
  })

  it('does not mistake an area code for a country code', () => {
    // 0359 is a real Bulgarian area code, so stripping a leading 359 from a
    // national number would quietly mangle it into something else.
    expect(phoneProblem('0359 12345')).toBe('notMobile')
  })

  it('cannot be padded into passing with spaces', () => {
    expect(phoneProblem('0 8 8 7 1 1 5')).toBe('tooShort')
  })

  it('has a message in both languages for every problem it can report', () => {
    // A code with no message is not a missing string, it is a crash: next-intl
    // throws MISSING_MESSAGE, and it throws on the one path nobody tried — the
    // customer who typed a Greek number. Cheaper to catch here.
    for (const problem of PHONE_PROBLEMS) {
      expect(en.checkout.error.phone, `en.json is missing error.phone.${problem}`).toHaveProperty(
        problem
      )
      expect(bg.checkout.error.phone, `bg.json is missing error.phone.${problem}`).toHaveProperty(
        problem
      )
    }
  })
})
