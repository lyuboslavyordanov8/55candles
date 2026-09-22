/**
 * `YYYY-MM` months, and the instants that bound them in Sofia.
 *
 * Pure, and separate from everything else in the accounting module because it is
 * the one piece the correctness of every figure depends on.
 *
 * ## Why not UTC days
 *
 * `dateRangeBounds` in `admin-orders.ts` reads calendar days as UTC and says so:
 * a filter that puts a late-evening order on the next day is a nuisance, not a
 * defect. **A month boundary is different.** Bulgaria is UTC+2 or UTC+3, so an
 * order placed at 01:00 on 1 September is 22:00 on 31 August in UTC — and a
 * monthly accounting period built on UTC would hand it to the accountant in the
 * wrong month, in the wrong VAT-threshold window, and in a total the owner
 * cannot reconcile against their own calendar.
 *
 * So the bounds here are the UTC instants of Sofia midnights, offset read from
 * the zone at that instant rather than hardcoded, which is what makes the March
 * and October changeovers come out right.
 */

const TIME_ZONE = 'Europe/Sofia'

/** `2026-09`. Anything else is not a period as far as this module is concerned. */
const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isPeriodKey(value: string): boolean {
  return PERIOD_PATTERN.test(value)
}

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
})

/** Which month an instant falls in, as the shop's calendar sees it. */
export function periodOf(at: Date): string {
  // `en-CA` renders `2026-09`; the parts API would need reassembling by hand.
  return formatter.format(at)
}

/**
 * Sofia's offset from UTC at a given instant, in minutes.
 *
 * Read from the zone rather than assumed, so the two weekends a year when the
 * offset changes do not need a special case anywhere else.
 */
function sofiaOffsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value

  // `GMT+03:00`, or `GMT` exactly when the offset is zero — which Sofia's never
  // is, but reading it defensively costs one branch.
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!match) return 0

  const [, sign, hours, minutes] = match

  return (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes))
}

/**
 * Midnight in Sofia on a given calendar date, as a UTC instant.
 *
 * Two passes: guess with the offset that applies at the UTC-naive instant, then
 * re-read the offset at the guess and correct. That second pass is what makes
 * the last Sunday in March right — on that date the naive guess falls on the
 * other side of the changeover.
 */
function sofiaMidnight(year: number, month: number, day: number): Date {
  const naive = Date.UTC(year, month - 1, day)
  const firstGuess = new Date(naive - sofiaOffsetMinutes(new Date(naive)) * 60_000)

  return new Date(naive - sofiaOffsetMinutes(firstGuess) * 60_000)
}

export interface PeriodBounds {
  /** Inclusive: the first instant of the month in Sofia. */
  start: Date
  /** Exclusive: the first instant of the *next* month in Sofia. */
  end: Date
}

/**
 * The `[start, end)` instants of a month. Throws on a malformed key, because a
 * silently wrong month is worse than a stack trace: every figure downstream
 * would be plausible and wrong.
 */
export function periodBounds(period: string): PeriodBounds {
  const match = period.match(PERIOD_PATTERN)
  if (!match) throw new Error(`not a period key: ${period}`)

  const year = Number(match[1])
  const month = Number(match[2])

  return {
    start: sofiaMidnight(year, month, 1),
    end: month === 12 ? sofiaMidnight(year + 1, 1, 1) : sofiaMidnight(year, month + 1, 1),
  }
}

/** The month before a given one. `2026-01` → `2025-12`. */
export function previousPeriod(period: string): string {
  const match = period.match(PERIOD_PATTERN)
  if (!match) throw new Error(`not a period key: ${period}`)

  const year = Number(match[1])
  const month = Number(match[2])

  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, '0')}`
}

/**
 * The most recent `count` months, newest first, ending with the one `at` falls
 * in. What the period list and the rolling turnover window are built from.
 */
export function recentPeriods(count: number, at: Date = new Date()): string[] {
  const periods: string[] = []
  let period = periodOf(at)

  for (let index = 0; index < count; index += 1) {
    periods.push(period)
    period = previousPeriod(period)
  }

  return periods
}

const monthNames = [
  'януари',
  'февруари',
  'март',
  'април',
  'май',
  'юни',
  'юли',
  'август',
  'септември',
  'октомври',
  'ноември',
  'декември',
]

/** `2026-09` → `септември 2026`, for every screen that shows a month. */
export function formatPeriod(period: string): string {
  const match = period.match(PERIOD_PATTERN)
  if (!match) return period

  return `${monthNames[Number(match[2]) - 1]} ${match[1]}`
}
