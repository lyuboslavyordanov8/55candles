import { describe, it, expect } from 'vitest'
import { eur, ZERO } from '../money'
import {
  allDeliveryOptions,
  assertValidTariff,
  billableWeight,
  COURIERS,
  DELIVERY_METHODS,
  isShippingConfigured,
  LOCKER_MAX_GRAMS,
  PACKAGING_WEIGHT_GRAMS,
  quote,
  tariffKey,
  TariffError,
  tariffs,
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
  it('ships with no rate cards, because rates come from a signed contract', () => {
    // If this fails, someone invented a courier price. AUDIT.md Q-22.
    expect(Object.keys(tariffs)).toHaveLength(0)
    expect(isShippingConfigured()).toBe(false)
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

  it('reports an unset tariff as unconfigured rather than as free shipping', () => {
    // The regression that matters: a missing rate card must never quote zero.
    const result = quote(option, 900, eur(50))

    expect(result).toEqual({ status: 'unconfigured', reason: 'noTariff' })
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

  describe('with a rate card installed', () => {
    const key = tariffKey(option)

    function withTariff<T>(run: () => T): T {
      tariffs[key] = SAMPLE
      try {
        return run()
      } finally {
        delete tariffs[key]
      }
    }

    it('picks the band the weight falls in, inclusive of the upper bound', () => {
      withTariff(() => {
        expect(quote(option, 1000, eur(10))).toMatchObject({ price: eur(3.5) })
        expect(quote(option, 1001, eur(10))).toMatchObject({ price: eur(4.2) })
        expect(quote(option, 50_000, eur(10))).toMatchObject({ price: eur(6) })
      })
    })

    it('does not apply free shipping when no threshold is set', () => {
      withTariff(() => {
        // FREE_DELIVERY_OVER is null: no free delivery, not "free above zero".
        expect(quote(option, 500, eur(10_000))).toMatchObject({ free: false })
      })
    })

    it('reports no band when the card is closed below the parcel weight', () => {
      tariffs[key] = { bands: [{ upToGrams: 1000, price: eur(3.5) }] }
      try {
        expect(quote(option, 5000, eur(10))).toEqual({
          status: 'unavailable',
          reason: 'noBandForWeight',
        })
      } finally {
        delete tariffs[key]
      }
    })
  })
})
