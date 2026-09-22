import 'server-only'

import { and, count, eq, gte, inArray, lt, sql } from 'drizzle-orm'

import { getDb } from '@/db'
import { accountingPeriods, invoices, orders, type AccountingPeriodRow } from '@/db/schema'
import { recordAccountingEvent } from './audit'
import { expenseTotals, type ExpenseTotals } from './expenses'
import { formatPeriod, periodBounds, periodOf, recentPeriods } from './period-key'

/**
 * A month of accounting, assembled from the records that already exist.
 *
 * **Nothing is copied.** Sales come from `orders`, invoices from `invoices`,
 * expenses from `expenses`, every one of them queried by the month's own bounds.
 * A period row exists only to hold what the month knows about itself — how far
 * the close has got, who overrode it, what the owner wrote — so a figure here
 * can never disagree with the record behind it. The cost is a handful of queries
 * per page load; the alternative is a summary table that drifts, and a drifted
 * total is worse than a slow page.
 *
 * ## What the month can and cannot say
 *
 * It reports what this shop actually records. Refunds are a **count of orders**,
 * not an amount, because the schema has no refunded-amount column — and stating
 * an amount it cannot source would be the one thing an accounting module must
 * never do. Courier and payment-provider figures are absent for the same honest
 * reason: Econt's API gives no statement, Speedy is unused, and наложен платеж
 * is the only payment method there is.
 *
 * Nothing here is reachable without `requireAdmin()`.
 */

/** Statuses that mean a sale happened and has not been undone. */
const SOLD_STATUSES = [
  'confirmed',
  'packed',
  'shipped',
  'delivered',
  'cod_collected',
  'reconciled',
] as const

/** Statuses that mean it came undone. Counted, never netted off the revenue. */
const UNDONE_STATUSES = [
  'refused_at_delivery',
  'returned',
  'cancelled',
  'refunded',
  'partially_refunded',
] as const

/** Statuses where the courier has collected but the money is not in yet. */
const COD_IN_FLIGHT = ['shipped', 'delivered', 'cod_collected'] as const

export interface SalesSummary {
  /** Orders that count as sales, and what they add up to. */
  orderCount: number
  revenueMinor: number
  goodsMinor: number
  shippingMinor: number
  discountMinor: number
  /** Orders that came undone. A count: no amount is recorded anywhere. */
  undoneCount: number
  /** Наложен платеж that has left the shop but is not reconciled yet. */
  codOutstandingMinor: number
  codOutstandingCount: number
  /** Наложен платеж reconciled against the courier's transfer. */
  codReconciledMinor: number
}

async function salesSummary(start: Date, end: Date): Promise<SalesSummary> {
  const db = getDb()
  const inMonth = and(gte(orders.createdAt, start), lt(orders.createdAt, end))

  const [sold] = await db
    .select({
      orderCount: sql<number>`count(*)::int`,
      revenueMinor: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::int`,
      goodsMinor: sql<number>`coalesce(sum(${orders.goodsMinor}), 0)::int`,
      shippingMinor: sql<number>`coalesce(sum(${orders.shippingMinor}), 0)::int`,
      discountMinor: sql<number>`coalesce(sum(${orders.discountMinor}), 0)::int`,
    })
    .from(orders)
    .where(and(inMonth, inArray(orders.status, [...SOLD_STATUSES])))

  const [undone] = await db
    .select({ value: count() })
    .from(orders)
    .where(and(inMonth, inArray(orders.status, [...UNDONE_STATUSES])))

  const [inFlight] = await db
    .select({
      amount: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::int`,
      orders: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(and(inMonth, inArray(orders.status, [...COD_IN_FLIGHT])))

  const [reconciled] = await db
    .select({ amount: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::int` })
    .from(orders)
    .where(and(inMonth, eq(orders.status, 'reconciled')))

  return {
    orderCount: Number(sold?.orderCount ?? 0),
    revenueMinor: Number(sold?.revenueMinor ?? 0),
    goodsMinor: Number(sold?.goodsMinor ?? 0),
    shippingMinor: Number(sold?.shippingMinor ?? 0),
    discountMinor: Number(sold?.discountMinor ?? 0),
    undoneCount: Number(undone?.value ?? 0),
    codOutstandingMinor: Number(inFlight?.amount ?? 0),
    codOutstandingCount: Number(inFlight?.orders ?? 0),
    codReconciledMinor: Number(reconciled?.amount ?? 0),
  }
}

export interface InvoiceSummary {
  count: number
  totalMinor: number
}

async function invoiceSummary(start: Date, end: Date): Promise<InvoiceSummary> {
  const [row] = await getDb()
    .select({
      count: sql<number>`count(*)::int`,
      totalMinor: sql<number>`coalesce(sum(${invoices.totalMinor}), 0)::int`,
    })
    .from(invoices)
    .where(and(gte(invoices.issuedAt, start), lt(invoices.issuedAt, end)))

  return { count: Number(row?.count ?? 0), totalMinor: Number(row?.totalMinor ?? 0) }
}

// ---------------------------------------------------------------------------
// The close checklist
// ---------------------------------------------------------------------------

export type CheckState = 'done' | 'attention' | 'empty'

export interface CloseCheck {
  key: string
  label: string
  state: CheckState
  detail: string
  /** Where to go and fix it, when there is somewhere. */
  href?: string
  /** True when this check has to pass before the month may be called ready. */
  blocking: boolean
}

export interface AccountingHealth {
  checks: CloseCheck[]
  blockers: CloseCheck[]
  /** True when nothing blocking is outstanding. */
  ready: boolean
}

/**
 * What the month still needs, in the order the owner would work through it.
 *
 * `empty` is not `attention`: a month with no expenses at all is a month nobody
 * has entered yet, which is worth pointing at differently from a month with two
 * expenses missing their documents. Only genuine problems block.
 */
function health(
  period: string,
  sales: SalesSummary,
  expenses: ExpenseTotals,
  invoicesIssued: InvoiceSummary
): AccountingHealth {
  const checks: CloseCheck[] = [
    {
      key: 'sales',
      label: 'Продажби',
      state: sales.orderCount > 0 ? 'done' : 'empty',
      detail:
        sales.orderCount > 0
          ? `${sales.orderCount} ${sales.orderCount === 1 ? 'поръчка' : 'поръчки'} от магазина`
          : 'Няма поръчки в този месец',
      href: '/admin',
      blocking: false,
    },
    {
      key: 'invoices',
      label: 'Фактури',
      state: 'done',
      detail:
        invoicesIssued.count > 0
          ? `${invoicesIssued.count} издадени`
          : 'Няма издадени — фактура се издава само при поискване',
      href: '/admin/invoices',
      blocking: false,
    },
    {
      key: 'expenses',
      label: 'Разходи',
      state: expenses.count > 0 ? 'done' : 'empty',
      detail:
        expenses.count > 0
          ? `${expenses.count} записани`
          : 'Няма записани разходи за този месец',
      href: `/admin/accounting/expenses?period=${period}`,
      blocking: false,
    },
    {
      key: 'expense-documents',
      label: 'Документи по разходите',
      state: expenses.missingDocuments > 0 ? 'attention' : 'done',
      detail:
        expenses.missingDocuments > 0
          ? `${expenses.missingDocuments} без документ`
          : 'Всеки разход има документ',
      href: `/admin/accounting/expenses?period=${period}&missing=1`,
      blocking: true,
    },
    {
      key: 'expense-review',
      label: 'Разходи за преглед',
      state: expenses.needsReview > 0 ? 'attention' : 'done',
      detail:
        expenses.needsReview > 0
          ? `${expenses.needsReview} чакат преглед`
          : 'Няма непрегледани',
      href: `/admin/accounting/expenses?period=${period}&status=needs_review`,
      blocking: true,
    },
    {
      key: 'cod',
      label: 'Наложени платежи',
      state: sales.codOutstandingCount > 0 ? 'attention' : 'done',
      detail:
        sales.codOutstandingCount > 0
          ? `${sales.codOutstandingCount} пратки с неполучени пари`
          : 'Всички получени пари са отчетени',
      href: '/admin?status=cod_collected',
      blocking: false,
    },
  ]

  const blockers = checks.filter((check) => check.blocking && check.state === 'attention')

  return { checks, blockers, ready: blockers.length === 0 }
}

// ---------------------------------------------------------------------------
// The period
// ---------------------------------------------------------------------------

export interface AccountingPeriod {
  period: string
  label: string
  /** `open` until somebody moves it. See `PERIOD_STATUSES`. */
  status: string
  note: string
  overriddenAt: Date | null
  overriddenBy: string | null
  sales: SalesSummary
  invoices: InvoiceSummary
  expenses: ExpenseTotals
  health: AccountingHealth
  /** True while this is the month the shop is living in. */
  current: boolean
}

/**
 * Read one month. The row is created lazily, so a month nobody has touched
 * still reports its figures — a period that has to be "opened" before it can be
 * looked at is a click that buys nothing.
 */
export async function getAccountingPeriod(period: string): Promise<AccountingPeriod> {
  const { start, end } = periodBounds(period)

  const [row, sales, invoicesIssued, expenses] = await Promise.all([
    readPeriodRow(period),
    salesSummary(start, end),
    invoiceSummary(start, end),
    expenseTotals(period),
  ])

  return {
    period,
    label: formatPeriod(period),
    status: row?.status ?? 'open',
    note: row?.note ?? '',
    overriddenAt: row?.overriddenAt ?? null,
    overriddenBy: row?.overriddenBy ?? null,
    sales,
    invoices: invoicesIssued,
    expenses,
    health: health(period, sales, expenses, invoicesIssued),
    current: period === periodOf(new Date()),
  }
}

async function readPeriodRow(period: string): Promise<AccountingPeriodRow | null> {
  const [row] = await getDb()
    .select()
    .from(accountingPeriods)
    .where(eq(accountingPeriods.period, period))
    .limit(1)

  return row ?? null
}

/** The last `count` months, for the period list. Figures included. */
export async function listAccountingPeriods(count = 6): Promise<AccountingPeriod[]> {
  return Promise.all(recentPeriods(count).map((period) => getAccountingPeriod(period)))
}

export type PeriodStatusOutcome =
  | { status: 'ok' }
  | { status: 'blocked'; blockers: CloseCheck[] }
  | { status: 'failed' }

/**
 * Move a month along.
 *
 * `ready` is refused while a blocking check is outstanding unless `override` is
 * given, and an override is **recorded on the row and in the audit trail** — the
 * point is not to stop the owner, who may have a good reason, but to make sure
 * the reason is visible later when the accountant asks why a month with two
 * missing documents was sent.
 */
export async function setPeriodStatus(
  period: string,
  status: string,
  actor: string,
  options: { override?: boolean } = {}
): Promise<PeriodStatusOutcome> {
  const current = await getAccountingPeriod(period)

  if (status === 'ready' && !current.health.ready && !options.override) {
    return { status: 'blocked', blockers: current.health.blockers }
  }

  const overriding = status === 'ready' && !current.health.ready

  try {
    await getDb()
      .insert(accountingPeriods)
      .values({
        period,
        status,
        note: current.note,
        ...(overriding ? { overriddenAt: new Date(), overriddenBy: actor } : {}),
      })
      .onConflictDoUpdate({
        target: accountingPeriods.period,
        set: {
          status,
          updatedAt: new Date(),
          ...(overriding ? { overriddenAt: new Date(), overriddenBy: actor } : {}),
        },
      })

    await recordAccountingEvent({
      action: `period.${status}`,
      entity: 'period',
      entityId: period,
      period,
      actor,
      detail: overriding
        ? { overridden: true, blockers: current.health.blockers.map((check) => check.key) }
        : {},
    })

    return { status: 'ok' }
  } catch (error) {
    console.error('[accounting] period status not saved', error)

    return { status: 'failed' }
  }
}

/** Write the month's note. Its own action, because it is the one free-text field. */
export async function setPeriodNote(period: string, note: string, actor: string): Promise<boolean> {
  const trimmed = note.trim().slice(0, 1000)

  try {
    await getDb()
      .insert(accountingPeriods)
      .values({ period, note: trimmed })
      .onConflictDoUpdate({
        target: accountingPeriods.period,
        set: { note: trimmed, updatedAt: new Date() },
      })

    await recordAccountingEvent({
      action: 'period.note',
      entity: 'period',
      entityId: period,
      period,
      actor,
    })

    return true
  } catch (error) {
    console.error('[accounting] period note not saved', error)

    return false
  }
}

/**
 * Turnover over the rolling window the ДДС monitor watches.
 *
 * Sales only, and only the ones that stood: an order that was refused at
 * delivery never became turnover. Which statuses count is the same list the
 * month's revenue uses, so the monitor and the month can never disagree.
 */
export async function turnoverOverMonths(months: number): Promise<number> {
  const periods = recentPeriods(months)
  const oldest = periodBounds(periods[periods.length - 1]).start
  const newest = periodBounds(periods[0]).end

  const [row] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::int` })
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, oldest),
        lt(orders.createdAt, newest),
        inArray(orders.status, [...SOLD_STATUSES])
      )
    )

  return Number(row?.total ?? 0)
}

export { SOLD_STATUSES, UNDONE_STATUSES }
