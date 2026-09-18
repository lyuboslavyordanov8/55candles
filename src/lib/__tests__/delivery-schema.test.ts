import { describe, it, expect } from 'vitest'
import { fieldsFor, LIMITS, validateDelivery } from '../delivery-schema'

const VALID_OFFICE = {
  recipientName: 'Мария Иванова',
  phone: '+359 887 115 957',
  email: 'maria@example.com',
  courier: 'econt',
  method: 'office',
  city: 'София',
  postCode: '1000',
  officeId: 'ECONT-1234',
}

const VALID_DOOR = {
  ...VALID_OFFICE,
  method: 'door',
  officeId: '',
  street: 'ж.к. Младост 1, бл. 42, вх. Б, ет. 3, ап. 12',
}

describe('validateDelivery', () => {
  it('accepts a complete office delivery', () => {
    const result = validateDelivery(VALID_OFFICE)

    expect(result.errors).toEqual({})
    expect(result.valid).toBe(true)
  })

  it('accepts a Bulgarian address in its usual abbreviated form', () => {
    // ж.к. / бл. / вх. / ет. / ап. is how addresses are actually written; a
    // stricter pattern would reject real customers.
    expect(validateDelivery(VALID_DOOR).valid).toBe(true)
  })

  it('trims before measuring, so whitespace is not a value', () => {
    const result = validateDelivery({ ...VALID_OFFICE, recipientName: '   ' })

    expect(result.errors.recipientName).toBe('tooShort')
  })

  it('normalises the returned values', () => {
    const result = validateDelivery({ ...VALID_OFFICE, city: '  София  ' })

    expect(result.value.city).toBe('София')
  })

  describe('post code', () => {
    it('requires exactly four digits, which the courier APIs enforce anyway', () => {
      for (const postCode of ['', '10', '100', '10000', 'abcd', '1 00']) {
        expect(validateDelivery({ ...VALID_OFFICE, postCode }).errors.postCode).toBe('invalid')
      }
    })

    it('accepts a leading-zero code', () => {
      // Must not be treated as a number anywhere in the stack.
      expect(validateDelivery({ ...VALID_OFFICE, postCode: '0100' }).errors.postCode).toBeUndefined()
      expect(validateDelivery({ ...VALID_OFFICE, postCode: '0100' }).value.postCode).toBe('0100')
    })
  })

  describe('phone', () => {
    // The rules themselves are `phone.test.ts`. What matters here is that the
    // schema applies them, and that the value it hands on is the canonical one.

    it('accepts the separators people actually type', () => {
      for (const phone of ['+359887115957', '0887 115 957', '(0887) 115-957']) {
        expect(validateDelivery({ ...VALID_OFFICE, phone }).errors.phone).toBeUndefined()
      }
    })

    it('stores one canonical form, whatever was typed', () => {
      // So the waybill, the SMS gateway and any later "same customer?" question
      // all see the same string.
      for (const phone of ['0887 115 957', '+359 887 115 957', '00359887115957']) {
        expect(validateDelivery({ ...VALID_OFFICE, phone }).value.phone).toBe('+359887115957')
      }
    })

    it('rejects a number the courier could never send an SMS to', () => {
      // The whole point of the field: this is how the customer is told the
      // parcel has arrived.
      expect(validateDelivery({ ...VALID_OFFICE, phone: '02 123 4567' }).errors.phone).toBe(
        'notMobile'
      )
      expect(validateDelivery({ ...VALID_OFFICE, phone: '0887 115 95' }).errors.phone).toBe(
        'tooShort'
      )
      expect(validateDelivery({ ...VALID_OFFICE, phone: '+44 7700 900123' }).errors.phone).toBe(
        'notBulgarian'
      )
    })

    it('rejects letters as malformed, not as too short', () => {
      // "too short" would invite the customer to add more letters.
      expect(validateDelivery({ ...VALID_OFFICE, phone: '0887 CALL ME' }).errors.phone).toBe(
        'invalid'
      )
    })

    it('reports a missing phone as required, since the courier must call', () => {
      expect(validateDelivery({ ...VALID_OFFICE, phone: '' }).errors.phone).toBe('required')
    })
  })

  describe('email', () => {
    it('is optional, because a COD customer may not have one', () => {
      const result = validateDelivery({ ...VALID_OFFICE, email: '' })

      expect(result.errors.email).toBeUndefined()
      expect(result.valid).toBe(true)
    })

    it('is validated when supplied', () => {
      expect(validateDelivery({ ...VALID_OFFICE, email: 'not-an-email' }).errors.email).toBe(
        'invalid'
      )
    })
  })

  describe('method decides which location field is required', () => {
    it('requires a street for door delivery', () => {
      const result = validateDelivery({ ...VALID_DOOR, street: '' })

      expect(result.errors.street).toBe('required')
      expect(result.errors.officeId).toBeUndefined()
    })

    it('requires an office for office and locker delivery', () => {
      for (const method of ['office', 'locker']) {
        const result = validateDelivery({ ...VALID_OFFICE, method, officeId: '' })

        expect(result.errors.officeId).toBe('required')
        // Not also demanding a street, which would block every such order.
        expect(result.errors.street).toBeUndefined()
      }
    })

    it('does not require a street for office delivery', () => {
      expect(validateDelivery(VALID_OFFICE).errors.street).toBeUndefined()
    })

    it('lists the right fields for the form', () => {
      expect(fieldsFor('door')).toContain('street')
      expect(fieldsFor('door')).not.toContain('officeId')
      expect(fieldsFor('office')).toContain('officeId')
      expect(fieldsFor('locker')).toContain('officeId')
    })
  })

  describe('the office snapshot', () => {
    it('is optional, since the fallback field cannot produce one', () => {
      // A customer who typed an office code into the free-text field has no name
      // or address to send, and rejecting the order for that would be absurd.
      const result = validateDelivery(VALID_OFFICE)

      expect(result.valid).toBe(true)
      expect(result.value.officeName).toBe('')
      expect(result.value.officeAddress).toBe('')
    })

    it('carries the picker values through, trimmed', () => {
      const result = validateDelivery({
        ...VALID_OFFICE,
        officeName: '  София Гладстон  ',
        officeAddress: ' ул. Цар Самуил №3 ',
      })

      expect(result.value.officeName).toBe('София Гладстон')
      expect(result.value.officeAddress).toBe('ул. Цар Самуил №3')
    })

    it('truncates rather than rejecting an over-long value', () => {
      // These are the courier's own strings, echoed back by the picker. A length
      // problem here is our data problem, and there is nothing the customer
      // could edit to fix it — so losing the order over it would be the wrong
      // trade. The id, which is what the waybill needs, is unaffected.
      const result = validateDelivery({
        ...VALID_OFFICE,
        officeName: 'н'.repeat(LIMITS.officeName.max + 50),
        officeAddress: 'а'.repeat(LIMITS.officeAddress.max + 50),
      })

      expect(result.valid).toBe(true)
      expect(result.errors).toEqual({})
      expect(result.value.officeName).toHaveLength(LIMITS.officeName.max)
      expect(result.value.officeAddress).toHaveLength(LIMITS.officeAddress.max)
    })

    it('ignores a non-string snapshot without throwing', () => {
      const result = validateDelivery({
        ...VALID_OFFICE,
        officeName: { name: 'София' },
        officeAddress: 42,
      })

      expect(result.value.officeName).toBe('')
      expect(result.value.officeAddress).toBe('')
    })
  })

  describe('courier and method', () => {
    it('rejects an unknown courier or method', () => {
      expect(validateDelivery({ ...VALID_OFFICE, courier: 'dhl' }).errors.courier).toBe('invalid')
      expect(validateDelivery({ ...VALID_OFFICE, method: 'drone' }).errors.method).toBe('invalid')
    })

    it('rejects a missing courier rather than defaulting to one', () => {
      // Guessing the courier would route the parcel through a contract that
      // may not exist.
      expect(validateDelivery({ ...VALID_OFFICE, courier: undefined }).errors.courier).toBe(
        'invalid'
      )
    })
  })

  it('rejects non-string input without throwing', () => {
    // The server action receives whatever the network sends.
    const result = validateDelivery({ recipientName: 42, phone: null, city: [] })

    expect(result.valid).toBe(false)
    expect(result.value.recipientName).toBe('')
  })

  it('caps the courier note', () => {
    const note = 'x'.repeat(LIMITS.note.max + 1)

    expect(validateDelivery({ ...VALID_OFFICE, note }).errors.note).toBe('tooLong')
  })
})
