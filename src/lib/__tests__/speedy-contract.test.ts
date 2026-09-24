import { describe, it, expect } from 'vitest'

import {
  bannerChecks,
  netOfVat,
  speedyContractReport,
  type SpeedyParcel,
} from '@/lib/speedy-contract'

/**
 * The Speedy contract checks. Pure, so every clause is tested on a fixed date
 * rather than on whatever today happens to be.
 */

function parcel(at: string, priceMinor: number | null = 300, status: SpeedyParcel['status'] = 'shipped'): SpeedyParcel {
  return { bookedAt: new Date(at), priceMinor, status }
}

function report(parcels: SpeedyParcel[], now: string, options: { fiscal?: boolean; live?: boolean } = {}) {
  return speedyContractReport({
    parcels,
    now: new Date(now),
    fiscalReceiptOn: options.fiscal ?? true,
    live: options.live ?? true,
  })
}

function check(result: ReturnType<typeof report>, key: string) {
  return result.checks.find((c) => c.key === key)!
}

/** `count` parcels on one day, each 3.60 € with ДДС — 3.00 € without. */
function many(count: number, at: string, priceMinor = 360): SpeedyParcel[] {
  return Array.from({ length: count }, () => parcel(at, priceMinor))
}

describe('the monthly turnover', () => {
  it('takes Speedy’s ДДС out of the quoted price', () => {
    expect(netOfVat(360)).toBe(300)
    expect(netOfVat(245)).toBe(204)
  })

  it('only informs during the first contract year', () => {
    const result = report(many(2, '2026-10-05T10:00:00Z'), '2026-10-20T10:00:00Z')

    expect(check(result, 'turnover').tone).toBe('info')
    expect(result.months[0]).toMatchObject({ parcels: 2, turnoverMinor: 600, state: 'not_yet' })
  })

  it('warns in the second year when this month is on course to fall short', () => {
    const result = report(many(3, '2027-11-03T10:00:00Z'), '2027-11-10T10:00:00Z')

    expect(check(result, 'turnover').tone).toBe('warning')
    // 9.00 € of 51.13 € at 3.00 € a parcel: 15 more.
    expect(check(result, 'turnover').text).toContain('още около 15 пратки')
    expect(result.months[0].state).toBe('under')
  })

  it('is alarmed when last month ended under the minimum', () => {
    const result = report(many(2, '2027-10-10T10:00:00Z'), '2027-11-02T10:00:00Z')

    expect(check(result, 'turnover').tone).toBe('danger')
    expect(bannerChecks(result).map((c) => c.key)).toContain('turnover')
  })

  it('does not count a month with no parcels at all', () => {
    const result = report(many(20, '2027-06-10T10:00:00Z'), '2027-10-15T10:00:00Z')

    expect(result.months[1].state).toBe('idle')
    expect(check(result, 'turnover').tone).toBe('info')
  })

  it('is satisfied above the minimum', () => {
    const result = report(many(18, '2027-12-01T10:00:00Z'), '2027-12-15T10:00:00Z')

    expect(result.months[0]).toMatchObject({ turnoverMinor: 5400, state: 'ok' })
    expect(check(result, 'turnover').tone).toBe('success')
  })

  it('says when parcels have no price, rather than showing them as free', () => {
    const result = report([parcel('2027-12-01T10:00:00Z', null)], '2027-12-15T10:00:00Z')

    expect(result.months[0].unpriced).toBe(1)
    expect(check(result, 'turnover').text).toContain('нямат записана цена')
    expect(check(result, 'turnover').text).not.toContain('още около')
  })

  it('files a parcel under the Sofia month, not the UTC one', () => {
    // 00:30 on 1 November in Sofia is still October in UTC.
    const result = report([parcel('2027-10-31T22:30:00Z')], '2027-11-15T10:00:00Z')

    expect(result.months[0]).toMatchObject({ period: '2027-11', parcels: 1 })
  })
})

describe('a gap in parcels', () => {
  it('warns a month before the six months are up', () => {
    const result = report([parcel('2027-01-10T10:00:00Z')], '2027-06-15T10:00:00Z')

    expect(check(result, 'inactivity').tone).toBe('warning')
  })

  it('is fine after a recent parcel', () => {
    expect(check(report([parcel('2027-06-01T10:00:00Z')], '2027-06-15T10:00:00Z'), 'inactivity').tone).toBe('success')
  })
})

describe('renewing the preferential prices', () => {
  it('counts the contract year, and is content above 20 parcels', () => {
    const result = report(many(21, '2026-12-01T10:00:00Z'), '2027-01-10T10:00:00Z')

    expect(check(result, 'renewal').tone).toBe('success')
  })

  it('warns in the last 90 days while under the threshold', () => {
    const result = report(many(5, '2027-07-01T10:00:00Z'), '2027-08-01T10:00:00Z')

    expect(check(result, 'renewal').tone).toBe('warning')
    expect(check(result, 'renewal').text).toContain('5 пратки')
  })
})

describe('the credit limit', () => {
  it('warns at 80 % of the limit', () => {
    // 45 parcels at 3.60 € is 162 €, of 200 €.
    const result = report(many(45, '2027-12-02T10:00:00Z'), '2027-12-10T10:00:00Z')

    expect(check(result, 'credit').tone).toBe('warning')
  })
})

describe('the касов бон', () => {
  it('is a to-do before Speedy is live, kept off the order list', () => {
    const result = report([], '2026-10-01T10:00:00Z', { fiscal: false, live: false })

    expect(check(result, 'receipt').tone).toBe('warning')
    expect(check(result, 'live').tone).toBe('info')
    expect(bannerChecks(result)).toEqual([])
  })

  it('is urgent once Speedy is live without it', () => {
    const result = report([], '2026-10-01T10:00:00Z', { fiscal: false, live: true })

    expect(check(result, 'receipt').tone).toBe('danger')
    expect(result.worst).toBe('danger')
    expect(bannerChecks(result).map((c) => c.key)).toEqual(['receipt'])
  })
})
