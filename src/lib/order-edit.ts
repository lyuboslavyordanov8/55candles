import 'server-only'

import { and, eq, inArray, isNull, notExists } from 'drizzle-orm'

import { getDb } from '@/db'
import { invoices, orderEvents, orders, type Order, type OrderStatus } from '@/db/schema'
import { validateDelivery, type DeliveryDetails, type FieldErrors } from './delivery-schema'
import { resolveOffice } from './office-resolution'

/**
 * Correcting an order's customer and delivery details, and deleting an order
 * outright — for the admin.
 *
 * Both stop at the point where the order has become something outside the
 * database: a waybill carries the old address on a printed label, and an issued
 * фактура belongs to a series that may not have gaps. So an order with either is
 * neither edited nor deleted here; the waybill is cancelled first, and an
 * invoiced order is never deleted at all.
 *
 * An edit changes **who and where**, never **how much**. The delivery charge the
 * customer agreed to at checkout stays on the order even when the office or the
 * courier changes, because it is also the наложен платеж amount the courier
 * will collect — changing it is a new agreement with the customer, not a typo fix.
 */

/** Before a parcel exists. After `packed` it is on its way, and its label says where. */
export const EDITABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  'draft',
  'awaiting_cod',
  'confirmed',
  'packed',
]

/** The same, plus an order that was called off before it left. */
export const DELETABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  ...EDITABLE_ORDER_STATUSES,
  'cancelled',
]

export type EditBlocker =
  { reason: 'hasWaybill'; waybillNumber: string } | { reason: 'wrongStatus'; status: OrderStatus }

export type DeleteBlocker = EditBlocker | { reason: 'hasInvoice'; number: string }

/** Why the order's details cannot be changed, or `null` when they can. */
export function editBlocker(order: Pick<Order, 'status' | 'waybillNumber'>): EditBlocker | null {
  if (order.waybillNumber) return { reason: 'hasWaybill', waybillNumber: order.waybillNumber }
  if (!EDITABLE_ORDER_STATUSES.includes(order.status)) {
    return { reason: 'wrongStatus', status: order.status }
  }
  return null
}

/**
 * Why the order cannot be deleted, or `null` when it can.
 *
 * The invoice first: it is the one reason no later step can clear.
 */
export function deleteBlocker(
  order: Pick<Order, 'status' | 'waybillNumber'>,
  invoiceNumber: string | null
): DeleteBlocker | null {
  if (invoiceNumber) return { reason: 'hasInvoice', number: invoiceNumber }
  if (order.waybillNumber) return { reason: 'hasWaybill', waybillNumber: order.waybillNumber }
  if (!DELETABLE_ORDER_STATUSES.includes(order.status)) {
    return { reason: 'wrongStatus', status: order.status }
  }
  return null
}

/** The order's current details in the shape the delivery form and its validation use. */
export function deliveryDetailsOf(order: Order): DeliveryDetails {
  return {
    recipientName: order.recipientName,
    phone: order.phone,
    email: order.email,
    courier: order.courier,
    method: order.deliveryMethod,
    city: order.city,
    postCode: order.postCode,
    street: order.street,
    officeId: order.officeId,
    officeName: order.officeName,
    officeAddress: order.officeAddress,
    note: order.note,
  }
}

/** The columns an edit may write. */
export type EditableColumns = Pick<
  Order,
  | 'recipientName'
  | 'phone'
  | 'email'
  | 'courier'
  | 'deliveryMethod'
  | 'city'
  | 'postCode'
  | 'street'
  | 'officeId'
  | 'officeName'
  | 'officeAddress'
  | 'note'
>

/**
 * What the validated form writes to the order.
 *
 * A door order keeps no office and an office order keeps no street: the field
 * the method does not use is cleared rather than left behind, so a parcel moved
 * from an office to a door does not carry an office nobody will deliver to.
 */
export function columnsFor(
  details: DeliveryDetails,
  office?: { name: string; address: string }
): EditableColumns {
  const door = details.method === 'door'

  return {
    recipientName: details.recipientName,
    phone: details.phone,
    email: details.email,
    courier: details.courier,
    deliveryMethod: details.method,
    city: details.city,
    postCode: details.postCode,
    street: door ? details.street : '',
    officeId: door ? '' : details.officeId,
    officeName: door ? '' : (office?.name ?? details.officeName),
    officeAddress: door ? '' : (office?.address ?? details.officeAddress),
    note: details.note,
  }
}

/**
 * The changed columns as `old → new`, for the order's history.
 *
 * Flat strings rather than nested objects, because the history renders an
 * event's `detail` one `key: value` pair at a time.
 */
export function changesBetween(
  before: EditableColumns,
  after: EditableColumns
): Record<string, string> {
  const changes: Record<string, string> = {}

  for (const key of Object.keys(after) as (keyof EditableColumns)[]) {
    if (before[key] !== after[key]) {
      changes[key] = `${before[key] || '—'} → ${after[key] || '—'}`
    }
  }

  return changes
}

export type EditOutcome =
  | { status: 'ok'; changed: string[] }
  | { status: 'unchanged' }
  | { status: 'invalid'; errors: FieldErrors }
  | { status: 'blocked'; blocker: EditBlocker }
  | { status: 'missing' }

/**
 * Validate the form, re-check the office with the courier, and write the
 * changes with an event recording each one.
 *
 * The same validation as the checkout (`validateDelivery`), so an admin cannot
 * store a phone the courier's SMS will never reach any more than a customer can.
 * An office the courier answers it does not know is refused; one it cannot be
 * asked about is accepted, as at checkout, and re-checked at the waybill.
 */
export async function updateOrderDetails(
  orderId: string,
  input: Partial<Record<string, unknown>>,
  actor: string
): Promise<EditOutcome> {
  const db = getDb()

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  if (!order) return { status: 'missing' }

  const blocker = editBlocker(order)
  if (blocker) return { status: 'blocked', blocker }

  const delivery = validateDelivery(input)
  if (!delivery.valid) return { status: 'invalid', errors: delivery.errors }

  const before = columnsFor(deliveryDetailsOf(order))
  // The office is only asked about when it changed: an untouched office was
  // checked when the order was placed, and a courier outage should not stop
  // the admin fixing a misspelt name.
  const officeChanged =
    delivery.value.method !== 'door' &&
    (delivery.value.officeId !== order.officeId ||
      delivery.value.courier !== order.courier ||
      order.deliveryMethod === 'door')

  let snapshot: { name: string; address: string } | undefined
  if (officeChanged) {
    const office = await resolveOffice(delivery.value)
    if (office.status === 'unknown') return { status: 'invalid', errors: { officeId: 'unknown' } }
    snapshot = office.snapshot
  }

  const after = columnsFor(delivery.value, snapshot)
  const changes = changesBetween(before, after)
  if (Object.keys(changes).length === 0) return { status: 'unchanged' }

  const updated = await db
    .update(orders)
    .set({ ...after, updatedAt: new Date() })
    .where(
      // Again in the predicate: a waybill booked or a status moved since the read
      // above means the label may already carry the old details.
      and(
        eq(orders.id, orderId),
        isNull(orders.waybillNumber),
        inArray(orders.status, [...EDITABLE_ORDER_STATUSES])
      )
    )
    .returning({ status: orders.status, waybillNumber: orders.waybillNumber })

  if (updated.length === 0) {
    const [now] = await db
      .select({ status: orders.status, waybillNumber: orders.waybillNumber })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
    if (!now) return { status: 'missing' }
    return {
      status: 'blocked',
      blocker: editBlocker(now) ?? {
        reason: 'wrongStatus',
        status: now.status,
      },
    }
  }

  await db.insert(orderEvents).values({
    orderId,
    fromStatus: order.status,
    toStatus: order.status,
    actor,
    detail: { source: 'edit', ...changes },
  })

  return { status: 'ok', changed: Object.keys(changes) }
}

export type DeleteOutcome =
  | { status: 'ok'; orderNumber: string }
  | { status: 'blocked'; blocker: DeleteBlocker }
  | { status: 'missing' }

/**
 * Delete the order, its lines and its history.
 *
 * Meant for test orders and for spam, and irreversible: nothing of the order is
 * kept, which is also what a customer asking to be forgotten is owed. The order
 * number is not handed out again — the sequence has moved on — and that is fine,
 * because order numbers may have gaps where invoice numbers may not.
 *
 * Every condition is repeated in the `delete` itself, so an invoice issued or a
 * waybill booked between the check and the write leaves the order in place.
 */
export async function deleteOrder(orderId: string, actor: string): Promise<DeleteOutcome> {
  const db = getDb()

  const [order] = await db
    .select({
      orderNumber: orders.orderNumber,
      status: orders.status,
      waybillNumber: orders.waybillNumber,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
  if (!order) return { status: 'missing' }

  const [invoice] = await db
    .select({ number: invoices.number })
    .from(invoices)
    .where(eq(invoices.orderId, orderId))
    .limit(1)

  const blocker = deleteBlocker(order, invoice?.number ?? null)
  if (blocker) return { status: 'blocked', blocker }

  const deleted = await db
    .delete(orders)
    .where(
      and(
        eq(orders.id, orderId),
        isNull(orders.waybillNumber),
        inArray(orders.status, [...DELETABLE_ORDER_STATUSES]),
        notExists(
          db.select({ id: invoices.id }).from(invoices).where(eq(invoices.orderId, orderId))
        )
      )
    )
    .returning({ orderNumber: orders.orderNumber })

  if (deleted.length === 0) {
    // Something changed between the check and the delete. Say what, from a
    // fresh read — never by trying the delete again.
    const [now] = await db
      .select({ status: orders.status, waybillNumber: orders.waybillNumber })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
    if (!now) return { status: 'missing' }

    const [issued] = await db
      .select({ number: invoices.number })
      .from(invoices)
      .where(eq(invoices.orderId, orderId))
      .limit(1)

    return {
      status: 'blocked',
      blocker: deleteBlocker(now, issued?.number ?? null) ?? {
        reason: 'wrongStatus',
        status: now.status,
      },
    }
  }

  // The only trace left, and deliberately without the customer's details.
  console.info(`[orders] ${actor} deleted order ${order.orderNumber} (${order.status})`)

  return { status: 'ok', orderNumber: order.orderNumber }
}
