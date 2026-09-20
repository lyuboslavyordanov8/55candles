import { describe, it, expect, afterEach } from 'vitest'
import { eur } from '../money'
import {
  assertValidPromoCode,
  evaluatePromoCode,
  normalisePromoCode,
  PROMO_CODE_MAX,
  PROMO_CODES,
  promoCodesConfigured,
  PromoError,
  type PromoCode,
} from '../promo'

/**
 * The real table is restored after every case, so a failure here cannot change
 * what codes the rest of the run — or a later `npm test` reading the same
 * module — believes in.
 */
const SHIPPED = [...PROMO_CODES]

afterEach(() => {
  PROMO_CODES.length = 0
  PROMO_CODES.push(...SHIPPED)
})

/** Install a table for one case. */
function withCodes(codes: PromoCode[], run: () => void): void {
  PROMO_CODES.length = 0
  PROMO_CODES.push(...codes)

  run()
}

/** Noon in Sofia on the given day, as an instant. */
function sofiaNoon(day: string): Date {
  return new Date(`${day}T12:00:00+03:00`)
}

describe('normalisePromoCode', () => {
  it('accepts a code as it was read off a screen and typed by hand', () => {
    // Lower case and a space are what a customer copying a code out of an
    // Instagram story actually types. Rejecting that teaches them the shop is
    // broken, not that they mistyped.
    expect(normalisePromoCode('welcome 10')).toBe('WELCOME10')
    expect(normalisePromoCode('  WELCOME10  ')).toBe('WELCOME10')
    expect(normalisePromoCode('Welcome\t10')).toBe('WELCOME10')
  })

  it('truncates rather than rejecting an absurdly long entry', () => {
    // The cap exists so a response echoing the field cannot be made huge, not
    // as a validation rule — no real code is anywhere near it.
    expect(normalisePromoCode('A'.repeat(500))).toHaveLength(PROMO_CODE_MAX)
  })

  it('leaves an empty entry empty', () => {
    expect(normalisePromoCode('   ')).toBe('')
  })
})

describe('assertValidPromoCode', () => {
  it('accepts a canonical entry', () => {
    expect(() =>
      assertValidPromoCode({ code: 'WELCOME10', kind: 'percent', value: 10 })
    ).not.toThrow()
  })

  it('rejects an entry no typed code could ever match', () => {
    // `welcome10` in the table can never be matched, because what the customer
    // types is upper-cased before the comparison. Silently unusable is worse
    // than loud.
    expect(() => assertValidPromoCode({ code: 'welcome10', kind: 'percent', value: 10 })).toThrow(
      PromoError
    )
    expect(() => assertValidPromoCode({ code: '', kind: 'amount', value: 500 })).toThrow(PromoError)
  })

  it('rejects a percentage larger than the whole order', () => {
    // A 110% code would hand out money rather than goods.
    expect(() => assertValidPromoCode({ code: 'TOOMUCH', kind: 'percent', value: 110 })).toThrow(
      /more than the whole order/
    )
  })

  it('rejects a value that is not a positive whole number', () => {
    expect(() => assertValidPromoCode({ code: 'ZERO', kind: 'amount', value: 0 })).toThrow(
      PromoError
    )
    expect(() => assertValidPromoCode({ code: 'NEG', kind: 'amount', value: -500 })).toThrow(
      PromoError
    )
    expect(() => assertValidPromoCode({ code: 'FRAC', kind: 'amount', value: 12.5 })).toThrow(
      PromoError
    )
  })

  it('rejects an end date that is not a plain ISO day', () => {
    expect(() =>
      assertValidPromoCode({ code: 'XMAS', kind: 'percent', value: 10, lastDay: '31.12.2026' })
    ).toThrow(/YYYY-MM-DD/)
  })

  it('holds for every code the shop actually ships', () => {
    // The table is edited by hand by the owner. This is the case that catches a
    // typo before a customer does.
    for (const entry of PROMO_CODES) expect(() => assertValidPromoCode(entry)).not.toThrow()
  })
})

describe('evaluatePromoCode', () => {
  it('reports an empty field as nothing to say', () => {
    // Not a failure: most orders carry no code, and "that code is not valid"
    // under an untouched field is a bug report waiting to happen.
    expect(evaluatePromoCode('', eur(40))).toEqual({ status: 'none' })
    expect(evaluatePromoCode('   ', eur(40))).toEqual({ status: 'none' })
  })

  it('takes a percentage off the goods', () => {
    withCodes([{ code: 'TEN', kind: 'percent', value: 10 }], () => {
      expect(evaluatePromoCode('ten', eur(44.5))).toEqual({
        status: 'applied',
        code: 'TEN',
        discount: eur(4.45),
      })
    })
  })

  it('rounds a percentage to the cent, rather than to a fraction of one', () => {
    withCodes([{ code: 'TEN', kind: 'percent', value: 10 }], () => {
      // 10% of 19,99 is 1,999 — there is no such coin. Half up, and the result
      // is an integer number of cents either way.
      const outcome = evaluatePromoCode('TEN', eur(19.99))

      expect(outcome.status).toBe('applied')
      if (outcome.status !== 'applied') return
      expect(outcome.discount.amountMinor).toBe(200)
      expect(Number.isInteger(outcome.discount.amountMinor)).toBe(true)
    })
  })

  it('takes a fixed amount off, in the currency of the basket', () => {
    withCodes([{ code: 'PARVA5', kind: 'amount', value: 500 }], () => {
      expect(evaluatePromoCode('parva5', eur(44.5))).toEqual({
        status: 'applied',
        code: 'PARVA5',
        discount: eur(5),
      })
    })
  })

  it('stops at the goods total instead of crediting the delivery', () => {
    withCodes([{ code: 'BIG', kind: 'amount', value: 10_000 }], () => {
      // A 100,00 EUR code against a 19,99 EUR basket makes the candles free and
      // no more. Letting it run past zero would pay for the courier out of a
      // discount on the goods, or produce a negative bill.
      const outcome = evaluatePromoCode('BIG', eur(19.99))

      expect(outcome.status).toBe('applied')
      if (outcome.status !== 'applied') return
      expect(outcome.discount).toEqual(eur(19.99))
    })
  })

  it('gives the same answer for a code that does not exist as for a wrong one', () => {
    withCodes([{ code: 'SECRET', kind: 'percent', value: 50 }], () => {
      // The field must not become an oracle: a distinct message for "that code
      // exists but is not for you" is a way to enumerate the table.
      expect(evaluatePromoCode('NOPE', eur(40))).toEqual({ status: 'unknown', code: 'NOPE' })
    })
  })

  it('names an expired code as expired, not as unknown', () => {
    withCodes([{ code: 'KOLEDA', kind: 'percent', value: 15, lastDay: '2026-12-31' }], () => {
      expect(evaluatePromoCode('KOLEDA', eur(40), sofiaNoon('2027-01-01'))).toEqual({
        status: 'expired',
        code: 'KOLEDA',
      })
    })
  })

  it('works through the whole of the last day, in Bulgarian time', () => {
    withCodes([{ code: 'KOLEDA', kind: 'percent', value: 10, lastDay: '2026-12-31' }], () => {
      // 23:59 in Sofia on the 31st is already the 1st in UTC. Comparing in UTC
      // would switch the code off two hours early, during the evening the shop
      // is most likely to be advertising it.
      const lastMinuteInSofia = new Date('2026-12-31T23:59:00+02:00')

      expect(evaluatePromoCode('KOLEDA', eur(40), lastMinuteInSofia)).toMatchObject({
        status: 'applied',
      })
    })
  })

  it('does not expire a code that has no end date', () => {
    withCodes([{ code: 'FOREVER', kind: 'percent', value: 10 }], () => {
      expect(evaluatePromoCode('FOREVER', eur(40), sofiaNoon('2099-01-01'))).toMatchObject({
        status: 'applied',
      })
    })
  })

  it('says what the minimum is, so the customer can reach it', () => {
    withCodes([{ code: 'FROM40', kind: 'amount', value: 500, minGoodsMinor: 4000 }], () => {
      // "Not valid" would be a dead end. The amount is what lets the customer
      // decide whether a second candle is worth it.
      expect(evaluatePromoCode('FROM40', eur(39.99))).toEqual({
        status: 'belowMinimum',
        code: 'FROM40',
        minGoods: eur(40),
      })
    })
  })

  it('treats the minimum as inclusive', () => {
    withCodes([{ code: 'FROM40', kind: 'amount', value: 500, minGoodsMinor: 4000 }], () => {
      expect(evaluatePromoCode('FROM40', eur(40))).toMatchObject({ status: 'applied' })
    })
  })

  it('judges the minimum on the goods alone, not on the bill', () => {
    withCodes([{ code: 'FROM40', kind: 'amount', value: 500, minGoodsMinor: 4000 }], () => {
      // Goods 39,00 plus a 4,00 delivery clears 40,00 as a bill but not as a
      // basket. Judging the bill would make the same basket qualify or not
      // depending on which office the customer picked.
      expect(evaluatePromoCode('FROM40', eur(39))).toMatchObject({ status: 'belowMinimum' })
    })
  })

  it('applies a code that has nothing to take off, rather than failing', () => {
    withCodes([{ code: 'TEN', kind: 'percent', value: 10 }], () => {
      // A valid code against a zero basket. There is nothing to discount, but
      // the customer did nothing wrong and should not be told they did.
      expect(evaluatePromoCode('TEN', eur(0))).toEqual({
        status: 'applied',
        code: 'TEN',
        discount: eur(0),
      })
    })
  })

  it('throws on a malformed table entry rather than inventing a discount', () => {
    withCodes([{ code: 'BROKEN', kind: 'percent', value: 500 }], () => {
      expect(() => evaluatePromoCode('BROKEN', eur(40))).toThrow(PromoError)
    })
  })
})

describe('promoCodesConfigured', () => {
  it('is true while there is a code to enter', () => {
    expect(promoCodesConfigured()).toBe(true)
  })

  it('is false with an empty table, so the checkout hides the field', () => {
    // A field that can only ever say "not valid" is worse than no field.
    withCodes([], () => {
      expect(promoCodesConfigured()).toBe(false)
    })
  })
})
