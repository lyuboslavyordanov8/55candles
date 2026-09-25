import { describe, it, expect } from 'vitest'

import { isValidEik, normaliseVatNumber, validateBilling } from '@/lib/billing-schema'

/** The shop's own ЕИК — a real one, straight from the register. */
const REAL_EIK = '208907603'

const ticked = {
  wantsInvoice: 'on',
  invoiceCompany: 'Свещи ЕООД',
  invoiceEik: REAL_EIK,
  invoiceVatNumber: '',
  invoiceAddress: 'гр. София, ул. Шипка 1',
  invoiceAccountable: '',
}

describe('isValidEik', () => {
  it('accepts a real 9-digit ЕИК', () => {
    expect(isValidEik(REAL_EIK)).toBe(true)
  })

  it('refuses one digit mistyped', () => {
    expect(isValidEik('208907604')).toBe(false)
    expect(isValidEik('208917603')).toBe(false)
  })

  it('refuses two digits swapped', () => {
    expect(isValidEik('209807603')).toBe(false)
  })

  it('uses the second set of weights when the first gives 10', () => {
    // 1·1 + 8·8 = 65 ≡ 10 (mod 11), so the check digit comes from 3–10: 1·3 + 8·10 = 83 ≡ 6.
    expect(isValidEik('100000086')).toBe(true)
    expect(isValidEik('100000080')).toBe(false)
  })

  it('accepts a 13-digit branch code', () => {
    // Digits 9–12 are 3, 0, 0, 0: 2·3 = 6.
    expect(isValidEik('2089076030006')).toBe(true)
    // 2·3 + 5·1 = 11 ≡ 0.
    expect(isValidEik('2089076030010')).toBe(true)
    expect(isValidEik('2089076031231')).toBe(true)
  })

  it('refuses a branch code with a wrong last digit', () => {
    expect(isValidEik('2089076030007')).toBe(false)
  })

  it('refuses a branch code on an invalid root', () => {
    // The branch digits check out against 4 as well (2·4 = 8), but 208907604 is no ЕИК.
    expect(isValidEik('2089076040008')).toBe(false)
  })

  it('refuses anything that is not 9 or 13 digits', () => {
    expect(isValidEik('')).toBe(false)
    expect(isValidEik('20890760')).toBe(false)
    expect(isValidEik('BG208907603')).toBe(false)
    expect(isValidEik('20890760a')).toBe(false)
  })
})

describe('normaliseVatNumber', () => {
  it('adds BG to a bare number', () => {
    expect(normaliseVatNumber('208907603')).toBe('BG208907603')
  })

  it('upper-cases and drops spaces, dots and dashes', () => {
    expect(normaliseVatNumber('bg 208-907.603')).toBe('BG208907603')
  })
})

describe('validateBilling', () => {
  it('asks for nothing when the box is not ticked', () => {
    expect(validateBilling({ invoiceCompany: 'x', invoiceEik: '1' })).toEqual({
      requested: false,
      valid: true,
      errors: {},
      value: null,
    })
  })

  it('does not take a guessed value for the box', () => {
    expect(validateBilling({ ...ticked, wantsInvoice: 'yes' }).requested).toBe(false)
  })

  it('accepts a complete company and trims what it stores', () => {
    const result = validateBilling({
      ...ticked,
      invoiceCompany: '  Свещи ЕООД ',
      invoiceEik: '208 907 603',
      invoiceVatNumber: '208907603',
      invoiceAccountable: ' Мария Иванова ',
    })

    expect(result.valid).toBe(true)
    expect(result.value).toEqual({
      company: 'Свещи ЕООД',
      eik: REAL_EIK,
      vatNumber: 'BG208907603',
      address: 'гр. София, ул. Шипка 1',
      accountable: 'Мария Иванова',
    })
  })

  it('names every missing required field at once', () => {
    const result = validateBilling({ wantsInvoice: 'on' })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual({
      invoiceCompany: 'required',
      invoiceEik: 'required',
      invoiceAddress: 'required',
    })
  })

  it('refuses an ЕИК whose check digit is wrong', () => {
    expect(validateBilling({ ...ticked, invoiceEik: '208907604' }).errors).toEqual({
      invoiceEik: 'invalid',
    })
  })

  it('refuses a ДДС number that is not BG and 9–10 digits', () => {
    expect(validateBilling({ ...ticked, invoiceVatNumber: 'DE123456789' }).errors).toEqual({
      invoiceVatNumber: 'invalid',
    })
  })

  it('refuses text too long to print', () => {
    const result = validateBilling({
      ...ticked,
      invoiceCompany: 'а'.repeat(201),
      invoiceAddress: 'а'.repeat(201),
      invoiceAccountable: 'а'.repeat(101),
    })

    expect(result.errors).toEqual({
      invoiceCompany: 'tooLong',
      invoiceAddress: 'tooLong',
      invoiceAccountable: 'tooLong',
    })
  })
})
