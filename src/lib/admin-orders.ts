import 'server-only'

import { and, asc, count, desc, eq, gte, ilike, inArray, lt, ne, or, sum } from 'drizzle-orm'

import { getDb } from '@/db'
import {
  orderEvents,
  orderItems,
  orders,
  type Order,
  type OrderEvent,
  type OrderItem,
  type OrderStatus,
} from '@/db/schema'
import { canTransition } from '@/lib/order-status'
import type { Courier } from '@/lib/shipping'

/**
 * Reading and moving orders, for the admin (AUDIT.md Phase 7).
 *
 * Every query here is read-only except `advanceOrderStatus`, and that one keeps
 * the invariant the schema was built around: **status changes only through
 * `order_events`**. The event and the cached `orders.status` are written in one
 * batch, so the audit trail can never disagree with the column it summarises.
 *
 * Nothing in this module is reachable without `requireAdmin()` — the pages and
 * actions in `src/app/admin` call it first. That is the boundary; this module
 * assumes it has already been crossed.
 */

/** How many orders one page of the list shows. */
export const PAGE_SIZE = 25

export interface OrderListFilter {
  /** Restrict to these statuses. Empty or absent means all of them. */
  statuses?: readonly OrderStatus[]
  /** Free text: order number, recipient name, phone or email. */
  query?: string
  /** Restrict to one courier. Absent means both. */
  courier?: Courier
  /** Inclusive. `YYYY-MM-DD`, read against `createdAt` in the server's own zone. */
  dateFrom?: string
  /** Inclusive — see `buildWhere` for why this is a `<` on the *next* day. */
  dateTo?: string
  page?: number
}

export interface OrderListRow {
  id: string
  orderNumber: string
  status: OrderStatus
  createdAt: Date
  recipientName: string
  phone: string
  email: string
  city: string
  courier: Order['courier']
  deliveryMethod: Order['deliveryMethod']
  totalMinor: number
  currency: string
  itemCount: number
}

export interface OrderList {
  rows: OrderListRow[]
  /** Total matching the filter, not the page — the list prints "x of y". */
  total: number
  page: number
  pageCount: number
}

/**
 * One page of orders, newest first.
 *
 * Newest first because the list is a worklist: the order that just came in is the
 * one nobody has looked at yet.
 */
export async function listOrders(filter: OrderListFilter = {}): Promise<OrderList> {
  const db = getDb()
  const page = Math.max(1, Math.trunc(filter.page ?? 1))
  const where = buildWhere(filter)

  const [[totals], rows] = await Promise.all([
    db.select({ value: count() }).from(orders).where(where),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        recipientName: orders.recipientName,
        phone: orders.phone,
        email: orders.email,
        city: orders.city,
        courier: orders.courier,
        deliveryMethod: orders.deliveryMethod,
        totalMinor: orders.totalMinor,
        currency: orders.currency,
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ])

  const total = Number(totals?.value ?? 0)
  const quantities = await itemCounts(rows.map((row) => row.id))

  return {
    // Candles, not lines: three of one scent is three candles. Counted in its own
    // grouped query rather than joined onto the select above, because a join on
    // `order_items` multiplies the order row per item and every money figure would
    // then have to be de-duplicated afterwards.
    rows: rows.map((row) => ({ ...row, itemCount: quantities.get(row.id) ?? 0 })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

/** Candles per order, for the orders on this page only. */
async function itemCounts(orderIds: readonly string[]): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map()

  const rows = await getDb()
    .select({ orderId: orderItems.orderId, value: sum(orderItems.quantity) })
    .from(orderItems)
    .where(inArray(orderItems.orderId, [...orderIds]))
    .groupBy(orderItems.orderId)

  return new Map(rows.map((row) => [row.orderId, Number(row.value ?? 0)]))
}

/**
 * `dateFrom`/`dateTo` (`YYYY-MM-DD`) to the `[gte, lt)` bounds a `createdAt`
 * column is filtered against.
 *
 * Read as UTC calendar days, not Europe/Sofia ones — a known simplification
 * (Bulgaria is UTC+2/+3, so an order in the last two or three hours of a
 * Sofia day can be read as the next UTC day) rather than pulling in a
 * timezone-aware date library for a filter, not a legal record. Revisit if a
 * shift-boundary order being off by a day ever actually matters to how the
 * shop works.
 *
 * `to` is exclusive on the *next* day, not `lte` on the given day's own
 * midnight: an order created at 23:47 on the end date must still be included,
 * and `lte` against a bare date parses to that day's 00:00, which would drop
 * it. Pure, and exported only for the test that pins the boundary math down.
 */
export function dateRangeBounds(
  dateFrom: string | undefined,
  dateTo: string | undefined
): { gte?: Date; lt?: Date } {
  const bounds: { gte?: Date; lt?: Date } = {}

  if (dateFrom) {
    bounds.gte = new Date(`${dateFrom}T00:00:00.000Z`)
  }

  if (dateTo) {
    const nextDay = new Date(`${dateTo}T00:00:00.000Z`)
    nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    bounds.lt = nextDay
  }

  return bounds
}

function buildWhere(filter: OrderListFilter) {
  const clauses = []

  if (filter.statuses?.length) {
    clauses.push(inArray(orders.status, [...filter.statuses]))
  }

  if (filter.courier) {
    clauses.push(eq(orders.courier, filter.courier))
  }

  const { gte: from, lt: to } = dateRangeBounds(filter.dateFrom, filter.dateTo)
  if (from) clauses.push(gte(orders.createdAt, from))
  if (to) clauses.push(lt(orders.createdAt, to))

  const query = filter.query?.trim()

  if (query) {
    // `ilike` with a wrapped term: the shop searches by the tail of a phone number
    // or a fragment of a name at least as often as by a whole order number.
    const term = `%${query}%`
    clauses.push(
      or(
        ilike(orders.orderNumber, term),
        ilike(orders.recipientName, term),
        ilike(orders.phone, term),
        ilike(orders.email, term)
      )
    )
  }

  return clauses.length ? and(...clauses) : undefined
}

export interface OrderDetail {
  order: Order
  items: OrderItem[]
  /** Oldest first: the history reads downwards, like a story. */
  events: OrderEvent[]
}

/**
 * Just the order number, for the type-to-confirm check in front of an
 * irreversible action (issuing a waybill or a фактура) — cheaper than the full
 * `getOrderDetail` when that is all a caller needs to verify what was typed.
 */
export async function orderNumberOf(id: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1)

  return row?.orderNumber ?? null
}

/** One order with its lines and its whole audit trail, or undefined. */
export async function getOrderDetail(id: string): Promise<OrderDetail | undefined> {
  const db = getDb()

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
  if (!order) return undefined

  const [items, events] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)),
    db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, id))
      .orderBy(asc(orderEvents.createdAt)),
  ])

  return { order, items, events }
}

export interface RefusalHistoryRow {
  id: string
  orderNumber: string
  status: OrderStatus
  createdAt: Date
}

/**
 * Past orders on this phone number that were refused at the door or came back
 * (AUDIT.md order-management back office, item 5) — never counting the order
 * being looked at, so an order cannot flag itself.
 *
 * `phone` is compared as stored, which is the canonical `+359…` form
 * (`normaliseBulgarianPhone`, `delivery-schema.ts`) rather than whatever the
 * customer typed — two spellings of the same number already collapse to one
 * row before this query ever runs.
 */
export async function refusalHistory(
  phone: string,
  excludeOrderId: string
): Promise<RefusalHistoryRow[]> {
  if (!phone) return []

  return getDb()
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.phone, phone),
        ne(orders.id, excludeOrderId),
        inArray(orders.status, ['refused_at_delivery', 'returned'])
      )
    )
    .orderBy(desc(orders.createdAt))
}

/** How many orders sit in each status. The list's filter chips read this. */
export async function countByStatus(): Promise<Partial<Record<OrderStatus, number>>> {
  const rows = await getDb()
    .select({ status: orders.status, value: count() })
    .from(orders)
    .groupBy(orders.status)

  const counts: Partial<Record<OrderStatus, number>> = {}
  for (const row of rows) counts[row.status] = Number(row.value)
  return counts
}

export type StatusChange =
  | { status: 'ok'; order: { orderNumber: string; status: OrderStatus } }
  /** No such order. */
  | { status: 'missing' }
  /**
   * The order has moved on since the page was rendered, or the requested move is
   * not in the graph. Both are reported the same way: the admin re-reads the order
   * and sees where it actually is.
   */
  | { status: 'notAllowed'; from: OrderStatus }

export interface StatusChangeInput {
  orderId: string
  to: OrderStatus
  /**
   * What the admin believes the current status is — read from the page they are
   * acting on. Optional, and when given it is enforced: two people working the
   * same order cannot both advance it from a state only one of them saw.
   */
  expectedFrom?: OrderStatus
  /**
   * Who did it, for the event's `actor` — the name from the session
   * (`requireAdmin()`'s return value), never a hardcoded `'admin'`. Everyone
   * shares one password, so this is the only place "who" comes from.
   */
  actor: string
  /** Free-text context, stored on the event. */
  note?: string
  /**
   * Why, required by the caller (not enforced here) when `to` is
   * `refused_at_delivery` or `returned` — see `REQUIRES_REASON` in
   * `order-status.ts`. Stored as its own key rather than folded into `note` so
   * a future "which reasons recur" query does not have to parse prose.
   */
  reason?: string
  /** Set when the parcel is handed over; goes on the order, not just the event. */
  waybillNumber?: string
}

/**
 * Move an order to its next status.
 *
 * The transition is checked against `ALLOWED_TRANSITIONS` and against the status
 * actually in the database — never against what the form claimed — and the write
 * is one batch so the event and the column move together.
 */
export async function advanceOrderStatus(input: StatusChangeInput): Promise<StatusChange> {
  const db = getDb()

  const [current] = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status })
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1)

  if (!current) return { status: 'missing' }

  if (input.expectedFrom && input.expectedFrom !== current.status) {
    return { status: 'notAllowed', from: current.status }
  }

  if (!canTransition(current.status, input.to)) {
    return { status: 'notAllowed', from: current.status }
  }

  const now = new Date()

  await db.batch([
    db
      .update(orders)
      .set({
        status: input.to,
        updatedAt: now,
        ...(input.waybillNumber ? { waybillNumber: input.waybillNumber } : {}),
        // Timestamps are set by the transition that earns them, so "when was this
        // shipped" is answerable without replaying the event log.
        ...(input.to === 'shipped' ? { shippedAt: now } : {}),
        ...(input.to === 'delivered' ? { deliveredAt: now } : {}),
        ...(input.to === 'cod_collected' ? { codCollectedAt: now } : {}),
      })
      .where(
        // The status again in the predicate: if someone else moved the order
        // between the read above and this write, this update matches no row and
        // the event below is the only trace — which is why the event records the
        // `from` status it was written against.
        and(eq(orders.id, input.orderId), eq(orders.status, current.status))
      ),
    db.insert(orderEvents).values({
      orderId: input.orderId,
      fromStatus: current.status,
      toStatus: input.to,
      actor: input.actor,
      detail: {
        source: 'admin',
        ...(input.note ? { note: input.note } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.waybillNumber ? { waybillNumber: input.waybillNumber } : {}),
      },
    }),
  ])

  return { status: 'ok', order: { orderNumber: current.orderNumber, status: input.to } }
}

/** How long after a transition it can still be undone. */
export const UNDO_WINDOW_MS = 2 * 60_000

export type UndoEligibility =
  | { eligible: true; event: OrderEvent; revertTo: OrderStatus }
  | { eligible: false; reason: 'tooLate' | 'notLastTransition' }

/**
 * Whether the most recent status *transition* on this order can still be
 * undone, and what it would revert to.
 *
 * Pure — takes events already in hand rather than querying, so both the
 * mutation below and the order page's "show an Undo button" decision read the
 * exact same rule without a second round trip. `events` must be oldest first
 * (ascending `createdAt`), the same order `getOrderDetail` and this module's
 * own query below both already use — scanned from the end, so the newest
 * event is checked first without needing its own descending query.
 *
 * "Most recent transition" skips same-status events on purpose — a note (the
 * waybill module's `note()`, or the standalone "add a note" action) does not
 * consume or block the undo window; only another real transition does.
 */
export function undoEligibility(
  events: readonly OrderEvent[],
  currentStatus: OrderStatus,
  now = Date.now()
): UndoEligibility {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (event.fromStatus === null || event.fromStatus === event.toStatus) continue

    if (event.toStatus !== currentStatus) return { eligible: false, reason: 'notLastTransition' }

    if (now - event.createdAt.getTime() > UNDO_WINDOW_MS) {
      return { eligible: false, reason: 'tooLate' }
    }

    return { eligible: true, event, revertTo: event.fromStatus }
  }

  return { eligible: false, reason: 'notLastTransition' }
}

export type UndoOutcome =
  | { status: 'ok'; order: { orderNumber: string; status: OrderStatus } }
  | { status: 'missing' }
  /** The window has closed. Distinguished from `notLastTransition` because the
   *  fix is different: there, re-reading the page is the answer; here, it no
   *  longer is. */
  | { status: 'tooLate' }
  /**
   * Either nothing has ever moved this order, or something has moved it again
   * since the transition being undone — a note, another admin, a second click.
   * Undoing would revert the wrong thing, so this refuses rather than guessing
   * which earlier transition was meant.
   */
  | { status: 'notLastTransition' }

/**
 * Revert the most recent status change, if `undoEligibility` still says yes.
 *
 * Writes a new event rather than deleting the one being undone, so the history
 * keeps saying what actually happened, in order, including the correction.
 */
export async function revertLastStatusChange(
  orderId: string,
  actor: string
): Promise<UndoOutcome> {
  const db = getDb()

  const [order] = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)

  if (!order) return { status: 'missing' }

  const events = await db
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(asc(orderEvents.createdAt))

  const eligibility = undoEligibility(events, order.status)

  if (!eligibility.eligible) {
    return { status: eligibility.reason }
  }

  const { revertTo, event } = eligibility

  await db.batch([
    db
      .update(orders)
      .set({ status: revertTo, updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, order.status))),
    db.insert(orderEvents).values({
      orderId,
      fromStatus: order.status,
      toStatus: revertTo,
      actor,
      detail: { source: 'admin', undo: true, revertedEventId: event.id },
    }),
  ])

  return { status: 'ok', order: { orderNumber: order.orderNumber, status: revertTo } }
}
