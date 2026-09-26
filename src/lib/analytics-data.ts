import 'server-only'

import { and, count, countDistinct, desc, eq, gte, lt, ne, sql } from 'drizzle-orm'

import { getDb } from '@/db'
import { orders, pageViews, type NewPageView } from '@/db/schema'
import { ANALYTICS_RETENTION_DAYS, lastDays, mergeSources, type Device } from './analytics'

/**
 * Visit counting — the half that touches the database. The rules about what
 * is recorded, and why it identifies nobody, are in `./analytics`.
 */

/** One in this many recorded views also deletes what has outlived its retention. */
const PRUNE_EVERY = 500

export async function recordPageView(view: NewPageView): Promise<void> {
  const db = getDb()
  await db.insert(pageViews).values(view)

  // No cron on this deployment, so the clean-up rides on the traffic it cleans
  // up after. The traffic page also prunes, for the quiet months.
  if (Math.random() < 1 / PRUNE_EVERY) await pruneOldPageViews()
}

export async function pruneOldPageViews(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - ANALYTICS_RETENTION_DAYS * 86_400_000)
  await getDb().delete(pageViews).where(lt(pageViews.createdAt, cutoff))
}

export interface Tally {
  views: number
  visitors: number
}

export interface TrafficReport {
  /** The last `REPORT_DAYS` Sofia days, oldest first, with zeros for empty ones. */
  days: ({ day: string } & Tally)[]
  today: Tally
  week: Tally
  month: Tally
  pages: ({ path: string } & Tally)[]
  sources: { label: string; visits: number }[]
  countries: { country: string; visitors: number }[]
  devices: { device: Device; visitors: number }[]
  /** Orders placed in the same 30 days, for the conversion rate. */
  orders: number
}

export const REPORT_DAYS = 30

const sofiaDate = sql<string>`to_char(${pageViews.createdAt} at time zone 'Europe/Sofia', 'YYYY-MM-DD')`

/**
 * Everything the traffic page shows, for the last thirty days.
 *
 * "Visitors" everywhere is distinct `visitorHash` values, and since the hash
 * changes with the day, that is visitor-days — see `./analytics`. Summing the
 * days is therefore exact, not an approximation.
 */
export async function loadTrafficReport(now: Date = new Date()): Promise<TrafficReport> {
  const db = getDb()
  const days = lastDays(REPORT_DAYS, now)
  // A day of margin for the time zone; the Sofia date is what actually filters.
  const since = new Date(now.getTime() - (REPORT_DAYS + 1) * 86_400_000)
  const inRange = and(gte(pageViews.createdAt, since), gte(sofiaDate, days[0]))

  const visitors = countDistinct(pageViews.visitorHash)

  const [daily, pages, referrers, countries, devices, placed] = await db.batch([
    db
      .select({ day: sofiaDate, views: count(), visitors })
      .from(pageViews)
      .where(inRange)
      .groupBy(sofiaDate),
    db
      .select({ path: pageViews.path, views: count(), visitors })
      .from(pageViews)
      .where(inRange)
      .groupBy(pageViews.path)
      .orderBy(desc(count()))
      .limit(15),
    db
      .select({ host: pageViews.referrerHost, visits: count() })
      .from(pageViews)
      .where(and(inRange, eq(pageViews.entry, true)))
      .groupBy(pageViews.referrerHost),
    db
      .select({ country: pageViews.country, visitors })
      .from(pageViews)
      .where(inRange)
      .groupBy(pageViews.country)
      .orderBy(desc(visitors))
      .limit(10),
    db
      .select({ device: pageViews.device, visitors })
      .from(pageViews)
      .where(inRange)
      .groupBy(pageViews.device)
      .orderBy(desc(visitors)),
    db
      .select({ orders: count() })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, since),
          gte(sql`to_char(${orders.createdAt} at time zone 'Europe/Sofia', 'YYYY-MM-DD')`, days[0]),
          ne(orders.status, 'draft')
        )
      ),
  ])

  const byDay = new Map(daily.map((row) => [row.day, row]))
  const series = days.map((day) => ({
    day,
    views: Number(byDay.get(day)?.views ?? 0),
    visitors: Number(byDay.get(day)?.visitors ?? 0),
  }))

  return {
    days: series,
    today: sum(series.slice(-1)),
    week: sum(series.slice(-7)),
    month: sum(series),
    pages: pages.map((row) => ({
      path: row.path,
      views: Number(row.views),
      visitors: Number(row.visitors),
    })),
    sources: mergeSources(referrers.map((row) => ({ host: row.host, visits: Number(row.visits) }))),
    countries: countries.map((row) => ({
      country: row.country,
      visitors: Number(row.visitors),
    })),
    devices: devices.map((row) => ({
      device: row.device as Device,
      visitors: Number(row.visitors),
    })),
    orders: Number(placed[0]?.orders ?? 0),
  }
}

function sum(days: readonly Tally[]): Tally {
  return days.reduce(
    (total, day) => ({ views: total.views + day.views, visitors: total.visitors + day.visitors }),
    { views: 0, visitors: 0 }
  )
}
