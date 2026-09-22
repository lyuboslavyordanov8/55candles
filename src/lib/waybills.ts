import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'

import { getDb } from '@/db'
import { orderEvents, orders, type Order, type OrderEvent, type OrderStatus } from '@/db/schema'
import { canBookWaybills, courierClient, missingWaybillRequirements } from './couriers'
import type { Waybill, WaybillRequest } from './couriers/types'
import { money, type Currency } from './money'
import { isCourierBookable } from './shipping'

/**
 * Issuing a waybill for an order (AUDIT.md Phase 4).
 *
 * The one place in the shop that spends money on the shop's behalf: a booked
 * parcel is a parcel Econt will invoice for whether or not it is ever filled. So
 * the whole module is organised around *not doing it twice*:
 *
 * 1. `waybillBlocker()` refuses an order that already has a number, is not in a
 *    state where a parcel makes sense, or belongs to a courier we cannot book.
 * 2. An in-process claim stops two clicks in the same instance from racing past
 *    that check while the first is still waiting on Econt.
 * 3. The write back is conditional on `waybill_number IS NULL`, so if the claim
 *    is ever defeated — two instances, two admins — the loser reports it loudly
 *    with the orphaned number rather than overwriting the winner's.
 *
 * What it deliberately does *not* do is advance the order's status. Booking a
 * parcel and handing it over are different events on different days, and the
 * status graph (`src/lib/order-status.ts`) is about the second one. The number
 * simply appears, prefilled, in the form that marks the order shipped.
 *
 * Nothing here is reachable without `requireAdmin()` — same boundary as
 * `admin-orders.ts`, and this module assumes it has already been crossed.
 */

/**
 * The statuses an order may be booked in.
 *
 * `confirmed` is a human saying "pack this", which is the earliest point a parcel
 * is real. `packed` is the common case. Not `awaiting_cod`: a brand-new order
 * nobody has looked at may yet be a mistake or a duplicate, and a label printed
 * for it costs money to unprint.
 */
export const BOOKABLE_ORDER_STATUSES: readonly OrderStatus[] = ['confirmed', 'packed'] as const

export type WaybillBlocker =
  /** The order already has a number. Carries it, so the admin sees which. */
  | { reason: 'alreadyIssued'; waybillNumber: string }
  /** Too early or too late in the lifecycle for a parcel to make sense. */
  | { reason: 'wrongStatus'; status: OrderStatus }
  /**
   * The courier cannot book: Speedy, whose client is a stub, or Econt with
   * something still missing. `missing` names the environment variables.
   */
  | { reason: 'notBookable'; courier: Order['courier']; missing: string[] }

/**
 * Why this order cannot be booked, or `null` when it can.
 *
 * Pure and exported so the admin page can ask the question *before* rendering a
 * button, and so the action can ask it again before acting. Both matter: a button
 * that cannot work should say why, and a check made only in the UI is not a check.
 */
export function waybillBlocker(order: Order): WaybillBlocker | null {
  if (order.waybillNumber) {
    return { reason: 'alreadyIssued', waybillNumber: order.waybillNumber }
  }

  if (!BOOKABLE_ORDER_STATUSES.includes(order.status)) {
    return { reason: 'wrongStatus', status: order.status }
  }

  if (!isCourierBookable(order.courier) || !canBookWaybills(order.courier)) {
    return {
      reason: 'notBookable',
      courier: order.courier,
      missing: missingWaybillRequirements(order.courier),
    }
  }

  return null
}

/**
 * Where this shop serves an order's label from.
 *
 * **Under `/admin`, and that is the whole point of the function.** The session
 * cookie is scoped to `ADMIN_COOKIE_PATH`, so an endpoint outside it is handed no
 * cookie and answers 404 to an admin who is plainly logged in — which is what
 * `/api/admin/orders/[id]/label` did until 2026-09-22. One function, used by the
 * link and the print button alike, and a test that holds it inside that path.
 */
export function labelPath(orderId: string): string {
  return `/admin/orders/${orderId}/label`
}

/**
 * The label PDF from the order's history, newest first, or `null`.
 *
 * Kept in the booking event's `detail` rather than in a column: it is one link
 * per booking and the history is already where a booking is recorded, so a
 * column would be a migration to store a duplicate of something we have.
 *
 * The scheme is checked here and not by the caller, because the value arrives in
 * the courier's JSON and becomes a fetch target on the server: anything that is
 * not `http(s)` has no business reaching it.
 *
 * **`http` is upgraded rather than followed.** Production hands back a
 * `printLoading` export over plain http —
 * `http://ee.econt.com/api_export.php?exportMethod=printLoading&loading_num=…&_key=…`
 * — not the `PDFService.getPDF.json` link the demo service returns. The `_key`
 * in that query is the only thing guarding the file, so it does not travel in
 * the clear; `https://` was checked against the live service on 2026-09-22 and
 * serves the identical bytes with no redirect.
 */
export function labelPdfUrl(events: readonly OrderEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const detail = events[i].detail
    if (!detail || typeof detail !== 'object') continue

    const url = (detail as Record<string, unknown>).waybillPdfUrl
    if (typeof url !== 'string') continue

    if (url.startsWith('https://')) return url
    if (url.startsWith('http://')) return `https://${url.slice('http://'.length)}`
  }

  return null
}

/**
 * The order as a parcel.
 *
 * Every figure comes from the stored order rather than being recomputed: the
 * customer agreed to `total_minor` and that is the amount the courier must
 * collect, even if the tariff or the basket rules have changed since.
 *
 * The office branch sends only the code, and the door branch only the address —
 * `officeId` is populated for both in the schema's defaults, and sending both
 * would let Econt choose which one it delivers to.
 */
export function waybillRequestFor(order: Order): WaybillRequest {
  const toDoor = order.deliveryMethod === 'door'

  return {
    method: order.deliveryMethod,
    ...(toDoor
      ? { address: { city: order.city, postCode: order.postCode, street: order.street } }
      : { officeId: order.officeId }),
    weightGrams: order.weightGrams,
    // Read from the order, not assumed: a prepaid order must not have its total
    // collected a second time at the door.
    codAmount:
      order.paymentMethod === 'cod'
        ? money(order.totalMinor, order.currency as Currency)
        : null,
    recipient: {
      name: order.recipientName,
      phone: order.phone,
      ...(order.email ? { email: order.email } : {}),
    },
    orderNumber: order.orderNumber,
  }
}

export type WaybillOutcome =
  | { status: 'ok'; waybill: Waybill }
  | { status: 'missing' }
  | { status: 'blocked'; blocker: WaybillBlocker }
  /** Another request for this order is at the courier right now. */
  | { status: 'busy' }
  | { status: 'failed'; reason: string }

/**
 * Orders with a `create` in flight.
 *
 * In-process, so it does not survive a deploy and does not span instances — the
 * same honest limitation as the login throttle in `src/app/admin/actions.ts`. It
 * covers the case that actually happens (one admin, one tab, an impatient second
 * click on a call that takes seconds), and the conditional write below covers the
 * case it cannot.
 */
const inFlight = new Set<string>()

/**
 * Book the parcel for one order and record it.
 *
 * Returns rather than throws for every outcome the admin can do something about,
 * including the courier's own refusals — "Econt does not recognise that office"
 * is information, not a crash.
 */
export async function issueWaybillForOrder(orderId: string): Promise<WaybillOutcome> {
  const db = getDb()

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  if (!order) return { status: 'missing' }

  const blocker = waybillBlocker(order)
  if (blocker) return { status: 'blocked', blocker }

  if (inFlight.has(orderId)) return { status: 'busy' }
  inFlight.add(orderId)

  try {
    const result = await courierClient(order.courier).createWaybill(waybillRequestFor(order))

    if (result.status !== 'ok') {
      const reason =
        result.status === 'failed' ? result.reason : 'the courier is not configured for waybills'

      // Recorded on the order, because a failed booking is something the shop will
      // ask about later ("why is this parcel still here"), and the courier's own
      // wording is the only useful answer.
      await note(orderId, order.status, { waybillError: reason, courier: order.courier })

      return { status: 'failed', reason }
    }

    const waybill = result.data

    const claimed = await db
      .update(orders)
      .set({
        waybillNumber: waybill.number,
        trackingUrl: waybill.trackingUrl,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, orderId), isNull(orders.waybillNumber)))
      .returning({ id: orders.id })

    if (claimed.length === 0) {
      // Somebody booked this order between our check and our write. The parcel we
      // just created is real and nobody's — it has to be cancelled by hand in
      // my.econt.com, so the number goes into the audit trail where it can be
      // found rather than being dropped on the floor.
      console.error(
        `[waybills] order ${order.orderNumber} was booked twice; waybill ${waybill.number} ` +
          `is orphaned and must be cancelled at the courier`
      )
      await note(orderId, order.status, {
        orphanedWaybill: waybill.number,
        warning: 'booked twice — cancel this waybill at the courier',
      })

      return { status: 'failed', reason: `waybill ${waybill.number} is a duplicate and must be cancelled at Econt` }
    }

    await note(orderId, order.status, {
      waybillNumber: waybill.number,
      courier: order.courier,
      ...(waybill.pdfUrl ? { waybillPdfUrl: waybill.pdfUrl } : {}),
      ...(waybill.price ? { courierPrice: waybill.price.total.amountMinor } : {}),
      ...(waybill.expectedDeliveryDate ? { expectedDelivery: waybill.expectedDeliveryDate } : {}),
    })

    return { status: 'ok', waybill }
  } finally {
    inFlight.delete(orderId)
  }
}

/**
 * Append a note to an order's history without moving it.
 *
 * `from` and `to` are the same status on purpose: `order_events` is the audit
 * trail for *everything* that happens to an order, not only transitions, and a
 * row where they match reads as "this happened while the order sat here". The
 * alternative — a second table — would split the history the admin reads.
 */
async function note(
  orderId: string,
  status: OrderStatus,
  detail: Record<string, unknown>
): Promise<void> {
  await getDb()
    .insert(orderEvents)
    .values({
      orderId,
      fromStatus: status,
      toStatus: status,
      actor: 'admin',
      detail: { source: 'waybill', ...detail },
    })
}
