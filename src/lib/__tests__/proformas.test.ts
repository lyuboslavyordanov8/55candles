import { describe, it, expect, afterEach, vi } from 'vitest'

import {
  PROFORMA_VALID_DAYS,
  missingProformaDetails,
  parseProformaLines,
  proformaBank,
  proformaSnapshot,
} from '@/lib/proformas'
import { company } from '@/lib/company'

/**
 * Writing a проформа фактура (standalone, no order).
 *
 * `issueProforma` mints the number in the same statement that stores the row, so
 * it is not tested here — the same convention as `issueInvoiceForOrder`. What is
 * tested is everything that decides *what the document says*, because a проформа
 * is a price offer sent to a stranger: a wrong total is a number the shop can be
 * held to, and a missing bank line is a document nobody can pay.
 */

const BANK = {
  COMPANY_IBAN: 'BG18RZBB91550123456789',
  COMPANY_BIC: 'RZBBBGSF',
  COMPANY_BANK: 'Райфайзенбанк',
}

function banked() {
  for (const [name, value] of Object.entries(BANK)) vi.stubEnv(name, value)
  vi.stubEnv('INVOICE_ISSUER_NAME', 'Иван Иванов')
}

/** One filled-in row of the form, as it arrives. */
function row(description: string, quantity: string, unitPrice: string) {
  return { description, quantity, unitPrice }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the bank details a проформа is paid into', () => {
  it('reads them from the environment', () => {
    banked()

    expect(proformaBank()).toEqual({
      iban: 'BG18RZBB91550123456789',
      bic: 'RZBBBGSF',
      bankName: 'Райфайзенбанк',
      holder: company.legalName,
    })
  })

  it('is nothing at all while any one of them is missing', () => {
    // Not "partly configured": an IBAN without a bank name is a payment
    // instruction the customer's bank may refuse, and a document that cannot be
    // paid should not be issued at all.
    banked()
    vi.stubEnv('COMPANY_BIC', '')

    expect(proformaBank()).toBeNull()
  })

  it('names every variable still missing, so the admin is told which', () => {
    expect(missingProformaDetails()).toEqual(
      expect.arrayContaining(['COMPANY_IBAN', 'COMPANY_BIC', 'COMPANY_BANK'])
    )
  })

  it('has nothing to complain about once they are all set', () => {
    banked()

    expect(missingProformaDetails()).toEqual([])
  })

  it('treats whitespace as unset, like the rest of the document code', () => {
    banked()
    vi.stubEnv('COMPANY_IBAN', '   ')

    expect(missingProformaDetails()).toContain('COMPANY_IBAN')
  })
})

describe('the lines as they are typed in', () => {
  it('reads a line and works out its total', () => {
    const parsed = parseProformaLines([row('Свещ „Лавандула“, 200 g', '12', '9.50')])

    expect(parsed).toEqual({
      status: 'ok',
      lines: [
        {
          description: 'Свещ „Лавандула“, 200 g',
          quantity: 12,
          unitPriceMinor: 950,
          lineTotalMinor: 11400,
        },
      ],
    })
  })

  it('accepts a comma for the decimal point', () => {
    // Every Bulgarian keyboard types 9,50 before it types 9.50.
    const parsed = parseProformaLines([row('Свещ', '1', '9,50')])

    expect(parsed.status === 'ok' && parsed.lines[0].unitPriceMinor).toBe(950)
  })

  it('drops the blank rows the form always has', () => {
    const parsed = parseProformaLines([
      row('Свещ', '2', '9.50'),
      row('', '', ''),
      row('  ', '', '  '),
    ])

    expect(parsed.status === 'ok' && parsed.lines).toHaveLength(1)
  })

  it('refuses a proforma with no lines at all', () => {
    expect(parseProformaLines([row('', '', '')]).status).toBe('invalid')
    expect(parseProformaLines([]).status).toBe('invalid')
  })

  it('refuses a half-filled row rather than guessing what was meant', () => {
    expect(parseProformaLines([row('Свещ', '', '9.50')]).status).toBe('invalid')
    expect(parseProformaLines([row('', '2', '9.50')]).status).toBe('invalid')
    expect(parseProformaLines([row('Свещ', '2', '')]).status).toBe('invalid')
  })

  it('refuses a quantity that is not a whole positive number', () => {
    for (const quantity of ['0', '-1', '1.5', 'две', '1e3']) {
      expect(parseProformaLines([row('Свещ', quantity, '9.50')]).status).toBe('invalid')
    }
  })

  it('refuses a price that is not money', () => {
    for (const price of ['-1', '9.505', 'девет', '9.5.0', 'Infinity']) {
      expect(parseProformaLines([row('Свещ', '1', price)]).status).toBe('invalid')
    }
  })

  it('allows a zero price, because a free sample is a line too', () => {
    const parsed = parseProformaLines([row('Мостра', '1', '0')])

    expect(parsed.status === 'ok' && parsed.lines[0].unitPriceMinor).toBe(0)
  })
})

describe('the document', () => {
  const issuedAt = new Date('2026-09-22T09:00:00Z')

  function snapshot(overrides: Partial<Parameters<typeof proformaSnapshot>[0]> = {}) {
    banked()

    return proformaSnapshot({
      number: '0000000001',
      issuedAt,
      issuedBy: 'Иван Иванов',
      bank: proformaBank()!,
      buyer: { name: 'Мария Иванова', company: 'Тест ЕООД', eik: '123456789' },
      lines: [
        { description: 'Свещ', quantity: 2, unitPriceMinor: 950, lineTotalMinor: 1900 },
        { description: 'Доставка', quantity: 1, unitPriceMinor: 499, lineTotalMinor: 499 },
      ],
      ...overrides,
    })
  }

  it('totals the lines rather than trusting a figure from the form', () => {
    // The form has no "total" field on purpose: the only total that can be
    // reconciled against the lines is the one computed from them.
    expect(snapshot().money).toEqual({ currency: 'EUR', totalMinor: 2399 })
  })

  it('freezes the seller, so last year’s proforma keeps last year’s seat', () => {
    expect(snapshot().seller).toMatchObject({
      legalName: company.legalName,
      eik: company.eik,
      city: company.address.city,
    })
  })

  it('freezes the bank details for the same reason', () => {
    expect(snapshot().bank.iban).toBe(BANK.COMPANY_IBAN)
  })

  it('is valid for a stated number of days, not indefinitely', () => {
    const { validUntil } = snapshot()

    expect(new Date(validUntil).getTime() - issuedAt.getTime()).toBe(
      PROFORMA_VALID_DAYS * 24 * 60 * 60 * 1000
    )
  })

  it('says it is not an accounting document', () => {
    // The whole legal difference from a фактура, and the reason it consumes none
    // of the invoice series.
    expect(snapshot().kindNote).toMatch(/не е данъчен документ/)
  })

  it('says no VAT is charged, and why', () => {
    expect(snapshot().vatNote).toMatch(/чл\. 113/)
  })

  it('says it is paid by transfer, which is the point of a проформа', () => {
    expect(snapshot().paymentNote).toMatch(/превод/i)
  })

  it('drops the buyer fields that were left blank', () => {
    // A document printing "ЕИК:" followed by nothing reads as a missing detail.
    const { buyer } = snapshot({ buyer: { name: 'Мария Иванова', eik: '  ', company: '' } })

    expect(buyer).toEqual({ name: 'Мария Иванова' })
  })

  it('carries a note when one was written, and no empty note when not', () => {
    expect(snapshot({ note: 'Срок за изработка: 3 седмици' }).note).toBe(
      'Срок за изработка: 3 седмици'
    )
    expect(snapshot({ note: '   ' }).note).toBeUndefined()
  })
})
