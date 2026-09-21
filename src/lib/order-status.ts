import type { OrderStatus } from '@/db/schema'

/**
 * Which status may follow which (AUDIT.md B-14).
 *
 * The graph in `src/db/schema.ts` describes the lifecycle in prose; this is the
 * same graph as data, so the admin can only offer moves that make sense and a
 * mis-click cannot mark an unshipped parcel delivered.
 *
 * Two deliberate properties:
 *
 * 1. **No shortcut to settlement.** `cod_collected` is reachable only from
 *    `delivered`, and `reconciled` only from `cod_collected`. Money the courier
 *    has not reported collecting cannot be booked as collected, and cash that has
 *    not arrived cannot be reconciled (B-14).
 * 2. **Terminal states are terminal.** `reconciled`, `returned`, `cancelled` and
 *    `refunded` lead nowhere. Reopening an order is not an edit — it is a new
 *    order, or a correction someone has to make deliberately in the database with
 *    a reason.
 *
 * `partially_refunded` is the one exception that keeps a door open: a partial
 * refund can be followed by a full one.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  draft: ['awaiting_cod', 'cancelled'],
  // Where a COD order starts. Confirming it is a human saying "yes, pack this".
  awaiting_cod: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'refused_at_delivery'],
  delivered: ['cod_collected', 'returned', 'refunded', 'partially_refunded'],
  cod_collected: ['reconciled', 'refunded', 'partially_refunded'],
  reconciled: [],
  // The customer refused the parcel at the door; it travels back to the shop.
  refused_at_delivery: ['returned'],
  returned: [],
  cancelled: [],
  refunded: [],
  partially_refunded: ['refunded'],
}

/** True when `to` may follow `from`. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

/** The moves the admin should offer for an order in this status. */
export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return ALLOWED_TRANSITIONS[from]
}

/**
 * Bulgarian labels for the admin.
 *
 * Not in `messages/*.json`: the admin is a single-language internal tool, and
 * these strings must not ship to a customer's browser in either catalogue.
 */
export const STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  draft: 'чернова',
  awaiting_cod: 'нова (наложен платеж)',
  confirmed: 'потвърдена',
  packed: 'опакована',
  shipped: 'изпратена',
  delivered: 'доставена',
  cod_collected: 'парите са събрани',
  reconciled: 'парите са получени',
  refused_at_delivery: 'отказана при доставка',
  returned: 'върната',
  cancelled: 'отказана',
  refunded: 'възстановена сума',
  partially_refunded: 'частично възстановена',
}

/**
 * Statuses that must carry a reason on the event that reaches them.
 *
 * Both are the shop finding out something went wrong after the parcel had
 * already left, and "why" is the one thing worth writing down at the moment
 * it is freshest — it is also what the repeat-refusal flag reads later, so an
 * empty reason here would make that flag mean nothing.
 */
export const REQUIRES_REASON: readonly OrderStatus[] = [
  'refused_at_delivery',
  'returned',
] as const

export function statusRequiresReason(status: OrderStatus): boolean {
  return REQUIRES_REASON.includes(status)
}

/**
 * Which statuses count as "needs attention" on the order list.
 *
 * Everything before the parcel leaves the shop. This is what the list filters to
 * by default: the question the shop opens the admin to answer is "what do I have
 * to do now", not "what happened this year".
 */
export const OPEN_STATUSES: readonly OrderStatus[] = [
  'awaiting_cod',
  'confirmed',
  'packed',
] as const
