import { describe, it, expect } from 'vitest'

import {
  formatPeriod,
  isPeriodKey,
  periodBounds,
  periodOf,
  previousPeriod,
  recentPeriods,
} from '../period-key'

/**
 * Month boundaries in Sofia.
 *
 * The one piece of the accounting module every figure depends on: get a boundary
 * wrong and an order lands in the wrong month, in the wrong turnover window, and
 * in a total the owner cannot reconcile against their own calendar. So the
 * changeover weekends are tested explicitly, not assumed.
 */

describe('which month an instant belongs to', () => {
  it('reads the month in Sofia, not in UTC', () => {
    // 22:00 UTC on 31 August is 01:00 on 1 September in Sofia. A UTC month
    // would file this order in August and the accountant would find a total
    // that does not match their calendar.
    expect(periodOf(new Date('2026-08-31T22:00:00Z'))).toBe('2026-09')
  })

  it('keeps an instant that is the same day in both zones', () => {
    expect(periodOf(new Date('2026-09-15T09:00:00Z'))).toBe('2026-09')
  })

  it('handles the turn of the year the same way', () => {
    expect(periodOf(new Date('2025-12-31T22:00:00Z'))).toBe('2026-01')
  })
})

describe('the bounds of a month', () => {
  it('starts at Sofia midnight, which in summer is 21:00 UTC the day before', () => {
    // September is EEST, UTC+3.
    expect(periodBounds('2026-09').start.toISOString()).toBe('2026-08-31T21:00:00.000Z')
  })

  it('starts at 22:00 UTC in winter, when Sofia is UTC+2', () => {
    expect(periodBounds('2026-12').start.toISOString()).toBe('2026-11-30T22:00:00.000Z')
  })

  it('ends where the next month starts, exclusive', () => {
    const september = periodBounds('2026-09')
    const october = periodBounds('2026-10')

    expect(september.end.getTime()).toBe(october.start.getTime())
  })

  it('crosses into the next year at December', () => {
    expect(periodBounds('2026-12').end.toISOString()).toBe('2026-12-31T22:00:00.000Z')
  })

  it('gets the month containing the spring changeover right', () => {
    // Sofia moves to UTC+3 on the last Sunday of March. The month still begins
    // on a UTC+2 midnight and ends on a UTC+3 one, and both bounds must be the
    // real local midnight rather than one offset applied to both.
    const march = periodBounds('2026-03')

    expect(march.start.toISOString()).toBe('2026-02-28T22:00:00.000Z')
    expect(march.end.toISOString()).toBe('2026-03-31T21:00:00.000Z')
  })

  it('gets the month containing the autumn changeover right', () => {
    const october = periodBounds('2026-10')

    expect(october.start.toISOString()).toBe('2026-09-30T21:00:00.000Z')
    expect(october.end.toISOString()).toBe('2026-10-31T22:00:00.000Z')
  })

  it('refuses a key that is not a month rather than guessing one', () => {
    // A silently wrong month is worse than a thrown error: every figure
    // downstream would be plausible and wrong.
    for (const bad of ['2026-13', '2026-00', '2026-9', '26-09', 'септември', '']) {
      expect(() => periodBounds(bad)).toThrow()
    }
  })
})

describe('walking the calendar', () => {
  it('steps back a month, and across a year', () => {
    expect(previousPeriod('2026-09')).toBe('2026-08')
    expect(previousPeriod('2026-01')).toBe('2025-12')
  })

  it('lists the recent months newest first', () => {
    expect(recentPeriods(3, new Date('2026-09-15T09:00:00Z'))).toEqual([
      '2026-09',
      '2026-08',
      '2026-07',
    ])
  })

  it('recognises a period key', () => {
    expect(isPeriodKey('2026-09')).toBe(true)
    expect(isPeriodKey('2026-9')).toBe(false)
  })

  it('writes a month the way the shop says it', () => {
    expect(formatPeriod('2026-09')).toBe('септември 2026')
    expect(formatPeriod('2026-01')).toBe('януари 2026')
  })
})
