import { describe, it, expect } from 'vitest'

import { parseExpense, type ExpenseInput } from '../expenses'

/**
 * One typed expense, checked.
 *
 * The pure half of the module, and the half worth holding: this is where a
 * mistyped amount either becomes a stored figure the accountant has to chase
 * back to paper, or a message under the field that typed it.
 */

function input(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    supplier: 'Опаковки ЕООД',
    documentDate: '2026-09-18',
    category: 'packaging',
    total: '86,40',
    paymentMethod: 'card',
    documentMissing: false,
    ...overrides,
  }
}

describe('what an expense needs before it can be saved', () => {
  it('takes four fields and fills in the rest', () => {
    const parsed = parseExpense(input())

    expect(parsed.status).toBe('ok')
    expect(parsed.status === 'ok' && parsed.expense).toMatchObject({
      supplier: 'Опаковки ЕООД',
      category: 'packaging',
      totalMinor: 8640,
      netMinor: null,
      vatShownMinor: null,
      period: '2026-09',
    })
  })

  it('files the expense in the month of the document, not of today', () => {
    // The accountant sorts by the date on the paper. An invoice from August
    // entered in September belongs to August.
    const parsed = parseExpense(input({ documentDate: '2026-08-31' }))

    expect(parsed.status === 'ok' && parsed.expense.period).toBe('2026-08')
  })

  it('names the field that is wrong, not just that something is', () => {
    // A message under a form with nine inputs is a hunt.
    const parsed = parseExpense(input({ supplier: '   ' }))

    expect(parsed).toMatchObject({ status: 'invalid', field: 'supplier' })
  })

  it('accepts a comma for the decimal point', () => {
    expect(parseExpense(input({ total: '9,50' })).status === 'invalid').toBe(false)
    expect(
      parseExpense(input({ total: '9,50' })).status === 'ok' &&
        (parseExpense(input({ total: '9,50' })) as { expense: { totalMinor: number } }).expense
          .totalMinor
    ).toBe(950)
  })

  it('ignores the spaces a pasted amount brings with it', () => {
    const parsed = parseExpense(input({ total: '1 250,00' }))

    expect(parsed.status === 'ok' && parsed.expense.totalMinor).toBe(125000)
  })

  it('refuses an amount that is not money rather than rounding it', () => {
    for (const total of ['', 'осемдесет', '86.404', '-5', '8,4,0']) {
      expect(parseExpense(input({ total })).status).toBe('invalid')
    }
  })

  it('refuses a category or payment method this build does not know', () => {
    expect(parseExpense(input({ category: 'кораби' }))).toMatchObject({ field: 'category' })
    expect(parseExpense(input({ paymentMethod: 'чек' }))).toMatchObject({
      field: 'paymentMethod',
    })
  })

  it('refuses a date that is not one', () => {
    for (const documentDate of ['', '18.09.2026', '2026-9-18']) {
      expect(parseExpense(input({ documentDate })).status).toBe('invalid')
    }
  })
})

describe('the supplier document’s own amounts', () => {
  it('records the net and the VAT the supplier showed', () => {
    // Our company is not ДДС registered. Theirs may be, and their document says
    // so — that is a fact about the paper and it is stored as one.
    const parsed = parseExpense(input({ total: '120,00', net: '100,00', vatShown: '20,00' }))

    expect(parsed.status === 'ok' && parsed.expense).toMatchObject({
      totalMinor: 12000,
      netMinor: 10000,
      vatShownMinor: 2000,
    })
  })

  it('refuses a split that does not add up to what was paid', () => {
    // A mistyped digit here is a figure the accountant would have to chase back
    // to the paper, so it is caught while the paper is still in hand.
    const parsed = parseExpense(input({ total: '120,00', net: '100,00', vatShown: '19,00' }))

    expect(parsed).toMatchObject({ status: 'invalid', field: 'net' })
  })

  it('does not check the split when only one half was given', () => {
    // Half the документи carry only a total. Demanding the other half would be
    // demanding a number that is not printed anywhere.
    expect(parseExpense(input({ total: '120,00', net: '100,00' })).status).toBe('ok')
    expect(parseExpense(input({ total: '120,00', vatShown: '20,00' })).status).toBe('ok')
  })

  it('accepts a zero total, because a free delivery still has a document', () => {
    expect(parseExpense(input({ total: '0' })).status).toBe('ok')
  })
})
