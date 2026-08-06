import { describe, it, expect } from 'vitest'
import {
  HONEYPOT_FIELD,
  LIMITS,
  looksAutomated,
  validateContact,
} from '../contact-schema'

const valid = {
  name: 'Мария Петрова',
  email: 'maria@example.com',
  message: 'Здравейте, интересувам се от свещите с череши.',
}

describe('validateContact', () => {
  it('accepts a well-formed submission', () => {
    const result = validateContact(valid)

    expect(result.ok).toBe(true)
    expect(result.data).toEqual(valid)
    expect(result.errors).toEqual({})
  })

  it('trims whitespace rather than rejecting it', () => {
    const result = validateContact({
      name: '  Мария  ',
      email: '  maria@example.com  ',
      message: `  ${valid.message}  `,
    })

    expect(result.ok).toBe(true)
    expect(result.data?.name).toBe('Мария')
    expect(result.data?.email).toBe('maria@example.com')
  })

  it('rejects a whitespace-only message', () => {
    // Trimming must happen before the length check, or "   " passes as 3 chars.
    const result = validateContact({ ...valid, message: '          ' })

    expect(result.ok).toBe(false)
    expect(result.errors.message).toBe('tooShort')
  })

  it.each([
    ['not-an-email', 'invalid'],
    ['missing@tld', 'invalid'],
    ['@example.com', 'invalid'],
    ['two@@example.com', 'invalid'],
    ['spaces in@example.com', 'invalid'],
    ['', 'required'],
  ])('rejects the email %s', (email, code) => {
    const result = validateContact({ ...valid, email })

    expect(result.ok).toBe(false)
    expect(result.errors.email).toBe(code)
  })

  it.each([
    'firstname.lastname@example.co.uk',
    'user+tag@example.com',
    'мария@example.bg',
  ])('accepts the valid address %s', (email) => {
    // Over-strict email validation silently loses real enquiries.
    expect(validateContact({ ...valid, email }).ok).toBe(true)
  })

  it('enforces length limits', () => {
    expect(validateContact({ ...valid, name: 'x' }).errors.name).toBe('tooShort')
    expect(
      validateContact({ ...valid, name: 'x'.repeat(LIMITS.name.max + 1) }).errors.name
    ).toBe('tooLong')
    expect(
      validateContact({ ...valid, message: 'x'.repeat(LIMITS.message.max + 1) }).errors.message
    ).toBe('tooLong')
  })

  it('reports every invalid field at once', () => {
    const result = validateContact({ name: '', email: 'bad', message: '' })

    expect(Object.keys(result.errors).sort()).toEqual(['email', 'message', 'name'])
  })

  it.each([null, undefined, 'a string', 42, []])(
    'rejects the non-object payload %s',
    (payload) => {
      expect(validateContact(payload).ok).toBe(false)
    }
  )

  it('ignores non-string field types instead of throwing', () => {
    const result = validateContact({ name: 42, email: {}, message: [] })

    expect(result.ok).toBe(false)
    expect(result.errors.name).toBe('tooShort')
  })
})

describe('honeypot', () => {
  it('flags a populated hidden field', () => {
    expect(looksAutomated({ ...valid, [HONEYPOT_FIELD]: 'http://spam.example' })).toBe(true)
  })

  it('passes an empty or absent hidden field', () => {
    expect(looksAutomated({ ...valid, [HONEYPOT_FIELD]: '' })).toBe(false)
    expect(looksAutomated({ ...valid, [HONEYPOT_FIELD]: '   ' })).toBe(false)
    expect(looksAutomated(valid)).toBe(false)
  })

  it('does not throw on junk input', () => {
    expect(looksAutomated(null)).toBe(false)
    expect(looksAutomated('string')).toBe(false)
  })
})
