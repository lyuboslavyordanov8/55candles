import { describe, it, expect } from 'vitest'
import { eur, ZERO } from '../money'
import {
  allDeliveryOptions,
  assertValidTariff,
  billableWeight,
  codFeeFor,
  COURIERS,
  DELIVERY_METHODS,
  isShippingConfigured,
  LOCKER_MAX_GRAMS,
  PACKAGING_WEIGHT_GRAMS,
  quote,
  tariffKey,
  TariffError,
  tariffs,
  TARIFFS_ARE_PLACEHOLDER,
  type DeliveryOption,
  type Tariff,
} from '../shipping'

const SAMPLE: Tariff = {
  bands: [
    { upToGrams: 1000, price: eur(3.5) },
    { upToGrams: 2000, price: eur(4.2) },
    { upToGrams: null, price: eur(6) },
  ],
  codFee: eur(0.6),
}

describe('tariff configuration', () => {
  it('carries placeholder rate cards, and says they are placeholders', () => {
    // Rates come from a signed merchant contract (Q-22). The stand-ins exist so
    // the order flow can be exercised; the flag is what keeps that visible.
    // If this flag is cleared, the real cards must be in — see the checkout
    // notice driven by it.
    expect(TARIFFS_ARE_PLACEHOLDER).toBe(true)
    expect(isShippingConfigured()).toBe(true)
  })

  it('covers every courier and method, so no choice silently has no price', () => {
    for (const option of allDeliveryOptions()) {
      expect(tariffs[tariffKey(option)]).toBeDefined()
    }
  })

  it('has a valid rate card for every configured key', () => {
    // Ascending bands, open-ended last. A card that fails this would make a
    // heavier parcel cheaper than a lighter one.
    for (const [key, tariff] of Object.entries(tariffs)) {
      expect(() => assertValidTariff(key, tariff!)).not.toThrow()
    }
  })

  it('offers every courier and method combination for the picker', () => {
    expect(allDeliveryOptions()).toHaveLength(COURIERS.length * DELIVERY_METHODS.length)
  })

  it('accepts an ascending rate card', () => {
    expect(() => assertValidTariff('sample', SAMPLE)).not.toThrow()
  })

  it('rejects out-of-order bands, which would make a heavier parcel cheaper', () => {
    const broken: Tariff = {
      bands: [
        { upToGrams: 2000, price: eur(4.2) },
        { upToGrams: 1000, price: eur(3.5) },
      ],
    }
    expect(() => assertValidTariff('broken', broken)).toThrow(TariffError)
  })

  it('rejects an open-ended band that is not last, since it shadows the rest', () => {
    const broken: Tariff = {
      bands: [
        { upToGrams: null, price: eur(6) },
        { upToGrams: 1000, price: eur(3.5) },
      ],
    }
    expect(() => assertValidTariff('broken', broken)).toThrow(/must be last/)
  })

  it('rejects an empty rate card', () => {
    expect(() => assertValidTariff('empty', { bands: [] })).toThrow(TariffError)
  })
})

describe('billableWeight', () => {
  it('adds packaging to the goods weight', () => {
    expect(billableWeight([500, 500])).toBe(1000 + PACKAGING_WEIGHT_GRAMS)
  })

  it('charges no packaging for an empty basket, which has no parcel', () => {
    expect(billableWeight([])).toBe(0)
  })
})

describe('quote', () => {
  const option = { courier: 'econt' as const, method: 'office' as const }
  const key = tariffKey(option)

  it('reports an unset tariff as unconfigured rather than as free shipping', () => {
    // The regression that matters: a missing rate card must never quote zero.
    // Removed rather than assumed absent, now that placeholders are installed.
    const installed = tariffs[key]
    delete tariffs[key]
    try {
      expect(quote(option, 900, eur(50))).toEqual({
        status: 'unconfigured',
        reason: 'noTariff',
      })
    } finally {
      tariffs[key] = installed
    }
  })

  it('quotes the installed placeholder card by weight band', () => {
    expect(quote(option, 650, eur(20))).toMatchObject({ status: 'quoted', free: false })
  })

  it('refuses a locker parcel over the size limit', () => {
    const result = quote(
      { courier: 'speedy', method: 'locker' },
      LOCKER_MAX_GRAMS + 1,
      eur(50)
    )

    expect(result).toEqual({ status: 'unavailable', reason: 'tooHeavyForLocker' })
  })

  it('checks the locker limit before the tariff, so the reason is the real one', () => {
    // Both conditions hold; the customer needs to know the parcel is too big,
    // not that a rate card is missing.
    const result = quote({ courier: 'econt', method: 'locker' }, LOCKER_MAX_GRAMS + 1, ZERO)

    expect(result.status).toBe('unavailable')
  })

  describe('with a specific rate card installed', () => {
    /**
     * Swap in a card and put the installed one back afterwards. Restoring
     * rather than deleting matters now that the module ships placeholders — a
     * `delete` here would silently strip econt:office for every later test.
     */
    function withTariff<T>(card: Tariff, run: () => T): T {
      const installed = tariffs[key]
      tariffs[key] = card
      try {
        return run()
      } finally {
        tariffs[key] = installed
      }
    }

    it('picks the band the weight falls in, inclusive of the upper bound', () => {
      withTariff(SAMPLE, () => {
        expect(quote(option, 1000, eur(10))).toMatchObject({ price: eur(3.5) })
        expect(quote(option, 1001, eur(10))).toMatchObject({ price: eur(4.2) })
        expect(quote(option, 50_000, eur(10))).toMatchObject({ price: eur(6) })
      })
    })

    it('does not apply free shipping when no threshold is set', () => {
      withTariff(SAMPLE, () => {
        // FREE_DELIVERY_OVER is null: no free delivery, not "free above zero".
        expect(quote(option, 500, eur(10_000))).toMatchObject({ free: false })
      })
    })

    it('reports no band when the card is closed below the parcel weight', () => {
      withTariff({ bands: [{ upToGrams: 1000, price: eur(3.5) }] }, () => {
        expect(quote(option, 5000, eur(10))).toEqual({
          status: 'unavailable',
          reason: 'noBandForWeight',
        })
      })
    })
  })
})

describe('a price the courier quoted', () => {
  const option: DeliveryOption = { courier: 'econt', method: 'office' }

  it('is used exactly as given, in place of the rate card', () => {
    // The card is a stand-in for a contract that is not signed yet. Once Econt
    // prices the parcel itself, its figure is the one the customer is charged —
    // rounding it towards a band, or averaging the two, would invent a third
    // number that neither we nor the courier can honour.
    const installed = tariffs[tariffKey(option)]
    tariffs[tariffKey(option)] = SAMPLE

    try {
      expect(quote(option, 500, eur(10), eur(3.44))).toEqual({
        status: 'quoted',
        price: eur(3.44),
        free: false,
      })
    } finally {
      tariffs[tariffKey(option)] = installed
    }
  })

  it('prices a parcel no card covers', () => {
    // Weight bands and configured couriers are properties of the stand-in table.
    // A real quote has already accounted for the weight, so neither
    // `noBandForWeight` nor `unconfigured` can apply to it.
    const installed = tariffs[tariffKey(option)]
    delete tariffs[tariffKey(option)]

    try {
      expect(quote(option, 50_000, eur(10), eur(9.9))).toEqual({
        status: 'quoted',
        price: eur(9.9),
        free: false,
      })
    } finally {
      tariffs[tariffKey(option)] = installed
    }
  })

  it('does not get a parcel into a locker it does not fit in', () => {
    // The limit is the locker's, not the tariff's, so a courier price cannot buy
    // its way past it. Econt would accept the booking and the parcel would be
    // rejected at the machine.
    expect(quote({ courier: 'econt', method: 'locker' }, LOCKER_MAX_GRAMS + 1, eur(10), eur(3.44)))
      .toEqual({ status: 'unavailable', reason: 'tooHeavyForLocker' })
  })
})

describe('the наложен платеж fee', () => {
  const option: DeliveryOption = { courier: 'econt', method: 'office' }

  it('is absorbed even when the courier itemises it (Q-23)', () => {
    // Econt quotes the fee as its own line, and we are told what it is — but who
    // pays it is our decision, not the courier's. While COD_FEE_PAID_BY is
    // 'merchant' the customer is charged nothing for it, and null (not zero)
    // records that there is no such line on this order.
    expect(codFeeFor(option, eur(0.3))).toBeNull()
  })
})
