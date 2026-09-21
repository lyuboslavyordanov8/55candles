import 'server-only'

import { eq } from 'drizzle-orm'

import { getDb } from '@/db'
import { orderEvents, orders } from '@/db/schema'

/**
 * Free-text staff notes on an order (order-management back office, item 2 —
 * "called twice, no answer").
 *
 * Append-only, like everything else about an order's history: `order_events`
 * with `fromStatus === toStatus` is already how the waybill module records
 * "something happened, nothing changed" (see `note()` in `waybills.ts`) — this
 * reuses exactly that shape rather than adding a second, competing place notes
 * could live. A note never changes what an order *is*, so there is nothing
 * here that could disagree with `orders.status`, and nothing here needs the
 * status-transition guards `advanceOrderStatus` enforces.
 *
 * Not reachable without `requireAdmin()` — same boundary as every other admin
 * module; this one assumes it has already been crossed.
 */
export const NOTE_MAX = 500

export type AddNoteOutcome = { status: 'ok' } | { status: 'missing' } | { status: 'empty' }

/** Trim and cap, or `null` for a note with nothing in it. Pure, for testing. */
export function normalizedNote(text: string): string | null {
  const trimmed = text.trim().slice(0, NOTE_MAX)
  return trimmed || null
}

export async function addOrderNote(
  orderId: string,
  actor: string,
  text: string
): Promise<AddNoteOutcome> {
  const trimmed = normalizedNote(text)
  if (!trimmed) return { status: 'empty' }

  const db = getDb()

  const [order] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)

  if (!order) return { status: 'missing' }

  await db.insert(orderEvents).values({
    orderId,
    fromStatus: order.status,
    toStatus: order.status,
    actor,
    detail: { source: 'admin', note: trimmed },
  })

  return { status: 'ok' }
}
