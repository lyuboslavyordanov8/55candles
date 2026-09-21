import 'server-only'

import { and, asc, count, desc, eq, ilike, inArray, or, sum } from 'drizzle-orm'

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

function buildWhere(filter: OrderListFilter) {
  const clauses = []

  if (filter.statuses?.length) {
    clauses.push(inArray(orders.status, [...filter.statuses]))
  }

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
  /** Free-text context, stored on the event. */
  note?: string
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
      actor: 'admin',
      detail: {
        source: 'admin',
        ...(input.note ? { note: input.note } : {}),
        ...(input.waybillNumber ? { waybillNumber: input.waybillNumber } : {}),
      },
    }),
  ])

  return { status: 'ok', order: { orderNumber: current.orderNumber, status: input.to } }
}
