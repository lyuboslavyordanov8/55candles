import { describe, it, expect } from 'vitest'
import {
  addMoney,
  compareMoney,
  eur,
  formatMoney,
  isZero,
  money,
  MoneyError,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  toMajorUnits,
  ZERO,
} from '../money'

describe('money construction', () => {
  it('rejects a non-integer amount, which is how float drift enters a ledger', () => {
    expect(() => money(24.5)).toThrow(MoneyError)
  })

  it('converts major units to integer minor units', () => {
    expect(eur(24.5).amountMinor).toBe(2450)
    expect(eur(0.01).amountMinor).toBe(1)
    expect(eur(100).amountMinor).toBe(10_000)
  })

  it('rejects precision the currency cannot represent', () => {
    // Far likelier to be a typo than an intent, and truncating it silently
    // would misprice the product.
    expect(() => eur(24.999)).toThrow(/precision/)
  })

  it('rejects a non-finite amount', () => {
    expect(() => eur(Number.NaN)).toThrow(MoneyError)
    expect(() => eur(Number.POSITIVE_INFINITY)).toThrow(MoneyError)
  })

  it('handles the float values that break naive decimal arithmetic', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE 754. Summing cents avoids it.
    expect(addMoney(eur(0.1), eur(0.2)).amountMinor).toBe(30)
    expect(sumMoney([eur(0.07), eur(0.07), eur(0.07)]).amountMinor).toBe(21)
  })

  it('rejects a third decimal place rather than rounding it away', () => {
    // 1.005 is not representable in cents. Silently picking 1.00 or 1.01 would
    // misprice the product either way, so it is the author's call to make.
    expect(() => eur(1.005)).toThrow(/precision/)
  })
})

describe('arithmetic', () => {
  it('adds and subtracts in minor units', () => {
    expect(addMoney(eur(10), eur(2.5)).amountMinor).toBe(1250)
    expect(subtractMoney(eur(10), eur(2.5)).amountMinor).toBe(750)
  })

  it('sums an empty list to zero rather than throwing', () => {
    expect(sumMoney([])).toEqual(ZERO)
    expect(isZero(sumMoney([]))).toBe(true)
  })

  it('sums a basket exactly', () => {
    const total = sumMoney([eur(24.5), eur(24.5), eur(19.99)])
    expect(total.amountMinor).toBe(6899)
  })

  it('multiplies by a whole quantity', () => {
    expect(multiplyMoney(eur(24.5), 3).amountMinor).toBe(7350)
    expect(multiplyMoney(eur(24.5), 0).amountMinor).toBe(0)
  })

  it('refuses a fractional or negative quantity', () => {
    // A fractional multiplier is a discount or a tax split — a different
    // operation with its own rounding policy.
    expect(() => multiplyMoney(eur(10), 1.5)).toThrow(MoneyError)
    expect(() => multiplyMoney(eur(10), -1)).toThrow(MoneyError)
  })

  it('refuses to combine different currencies', () => {
    const usd = { amountMinor: 100, currency: 'USD' as unknown as 'EUR' }
    expect(() => addMoney(eur(1), usd)).toThrow(/Cannot combine/)
  })

  it('compares by amount', () => {
    expect(compareMoney(eur(10), eur(5))).toBeGreaterThan(0)
    expect(compareMoney(eur(5), eur(10))).toBeLessThan(0)
    expect(compareMoney(eur(5), eur(5))).toBe(0)
  })
})

describe('formatting', () => {
  it('formats as euro in both locales', () => {
    // Symbol placement and decimal separator differ; neither is hardcoded.
    expect(formatMoney(eur(24.5), 'en')).toMatch(/24\.50/)
    expect(formatMoney(eur(24.5), 'bg')).toMatch(/24,50/)
  })

  it('always shows two decimal places', () => {
    expect(formatMoney(eur(24), 'en')).toMatch(/24\.00/)
  })

  it('renders major units for Offer JSON-LD', () => {
    expect(toMajorUnits(eur(24.5))).toBe('24.50')
    expect(toMajorUnits(eur(24))).toBe('24.00')
  })
})
