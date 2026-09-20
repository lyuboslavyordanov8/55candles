import 'server-only'

import { randomBytes, randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'

import { getDb } from '@/db'
import { orderEvents, orderItems, orders, type OrderStatus } from '@/db/schema'
import { isDatabaseConfigured } from '@/lib/env'
import { products } from '@/data/products'
import type { DeliveryDetails } from './delivery-schema'
import type { OrderTotal } from './order-total'
import type { PaymentMethod } from './payments'

/**
 * Order creation (AUDIT.md B-01, B-08, B-09, Q-34).
 *
 * The one place an order is written. Three properties it exists to guarantee,
 * in the order they matter:
 *
 * 1. **The order is written before the customer is told anything.** Cash on
 *    delivery is the only payment method (`src/lib/payments.ts`), so there is no
 *    provider to hand off to — which makes this the single moment the order comes
 *    into existence. If the write fails the customer must be told the order was
 *    not taken, never shown a number for a row that does not exist.
 * 2. **Submitting twice creates one order.** The checkout page mints an intent
 *    token, the form replays it, and a unique index on `orders.intent_token`
 *    makes the second insert lose. The loser then *reads* the winner and returns
 *    it, so a double-click, a refresh or a retried request all answer with the
 *    same order number instead of a duplicate parcel (B-09).
 * 3. **The order is a snapshot.** Name, unit price, weight and every total are
 *    copied in as they were at purchase. Re-reading them from the catalogue
 *    later would let a price change rewrite an invoice (B-08).
 *
 * Nothing here trusts the client: every figure comes from `calculateTotal()`,
 * which re-prices from slugs on the server, and the office snapshot comes from
 * the courier's own record wherever the courier could be reached.
 */

/** The `ok` branch of a total — the only one an order can be written from. */
export type PricedTotal = Extract<OrderTotal, { status: 'ok' }>

export interface OrderDraft {
  /**
   * Idempotency key, minted when the checkout page rendered. Must be the same
   * string across retries of the *same* submission and different for a genuinely
   * new one; `newIntentToken()` produces it.
   */
  intentToken: string
  /** Validated and normalised — `validateDelivery().value`, never raw input. */
  delivery: DeliveryDetails
  /**
   * The collection point as the courier describes it, when a courier answered.
   * Absent for door delivery, and for a courier with no credentials yet.
   */
  office?: { name: string; address: string }
  /** True when a courier confirmed the office code, rather than us echoing it. */
  officeVerified?: boolean
  /**
   * How the order is to be paid. Only `'cod'` exists today, and it is still passed
   * in rather than assumed here: the caller records what the customer agreed to,
   * and a second method must not silently inherit COD's status and fee.
   */
  paymentMethod: PaymentMethod
  /** Server-computed. The client never sends a price. */
  total: PricedTotal
}

export interface PlacedOrder {
  id: string
  /** Human-facing reference, e.g. 55C-2026-000123. */
  orderNumber: string
  /** Secret half of the confirmation/tracking address. Never logged. */
  publicToken: string
  status: OrderStatus
  /**
   * True when this submission replayed an intent that had already created the
   * order. The caller should treat it exactly like a fresh success — the point
   * of the token is that the customer cannot tell the difference — but it is
   * worth distinguishing in logs and it must not send a second confirmation
   * email (B-17) or a second parcel to the courier.
   */
  duplicate: boolean
}

/** Prefix of every order number. The brand, not the year. */
export const ORDER_NUMBER_PREFIX = '55C'

/** Digits in the counter half of an order number. 999 999 orders is plenty. */
const ORDER_NUMBER_DIGITS = 6

/**
 * Longest intent token accepted.
 *
 * The tokens this code mints are 36 characters (a UUID). The cap is here only so
 * a hand-rolled POST cannot make the unique index store a megabyte.
 */
export const INTENT_TOKEN_MAX = 100

/** True once a database is configured and orders can actually be stored. */
export function isOrderStorageReady(): boolean {
  return isDatabaseConfigured
}

/**
 * A fresh idempotency key for one checkout attempt.
 *
 * Minted when the page renders, not when the form is submitted: a token created
 * at submission time would be new on every click, which is precisely the
 * duplicate this guards against.
 */
export function newIntentToken(): string {
  return randomUUID()
}

/**
 * Where every new order starts.
 *
 * Confirmed, and owing money the shop does not have yet: the courier collects on
 * delivery and remits later. There is no `paid` status to reach at checkout and
 * none to skip to — `awaiting_cod` is the truth for the whole of a COD order's
 * life until the collection is reported (AUDIT.md B-14).
 */
export const INITIAL_ORDER_STATUS: OrderStatus = 'awaiting_cod'

/** Format the printed reference from the counter and the order's own year. */
export function formatOrderNumber(counter: number, year: number): string {
  return `${ORDER_NUMBER_PREFIX}-${year}-${String(counter).padStart(ORDER_NUMBER_DIGITS, '0')}`
}

/**
 * The line-item rows for an order, snapshotted.
 *
 * `name` is the catalogue's own product name rather than a translated one: it is
 * the same string in both languages (they are brand names, see
 * `src/data/products.ts`), and an invoice line should not depend on which
 * language the customer happened to be browsing in. The slug is kept beside it,
 * so a renamed product is still traceable.
 */
export function buildItemRows(
  orderId: string,
  total: PricedTotal
): Array<typeof orderItems.$inferInsert> {
  return total.lines.map((line) => ({
    orderId,
    productSlug: line.slug,
    name: products.find((product) => product.slug === line.slug)?.name ?? line.slug,
    unitPriceMinor: line.unitPrice.amountMinor,
    currency: line.unitPrice.currency,
    quantity: line.quantity,
    lineTotalMinor: line.lineTotal.amountMinor,
    // `PricedLine.weightGrams` is the whole line; the column is per unit.
    unitWeightGrams: Math.round(line.weightGrams / line.quantity),
    // Null while the VAT position is unresolved (Q-03). A zero here would be a
    // claim that these sales carry no VAT, which nobody has established.
    vatRateBasisPoints: null,
  }))
}

/**
 * Write the order, or return the one this intent already created.
 *
 * Throws only when the database is unreachable or rejects the data — the caller
 * must treat that as "the order was not taken" and say so, never as a success.
 * A missing database is not an error to catch here: check
 * `isOrderStorageReady()` first, because a shop that cannot store orders should
 * refuse them visibly rather than at the last step.
 */
export async function createOrder(draft: OrderDraft): Promise<PlacedOrder> {
  const db = getDb()

  // The cheap path, and the common one for a real replay: the customer pressed
  // the button twice and the first press has already finished.
  const existing = await findByIntent(draft.intentToken)
  if (existing) return { ...existing, duplicate: true }

  const id = randomUUID()
  const status = INITIAL_ORDER_STATUS
  const orderNumber = formatOrderNumber(await nextCounter(), new Date().getFullYear())
  const publicToken = randomBytes(24).toString('base64url')

  const { delivery, total } = draft

  const orderRow: typeof orders.$inferInsert = {
    // Generated here rather than by `defaultRandom()` so the items and the
    // creation event can name it in the same batch — see below.
    id,
    orderNumber,
    intentToken: draft.intentToken,
    publicToken,
    status,

    recipientName: delivery.recipientName,
    phone: delivery.phone,
    email: delivery.email,
    city: delivery.city,
    postCode: delivery.postCode,
    street: delivery.street,
    note: delivery.note,

    courier: delivery.courier,
    deliveryMethod: delivery.method,
    officeId: delivery.officeId,
    // The courier's own strings when it answered, the picker's copies otherwise.
    officeName: draft.office?.name ?? '',
    officeAddress: draft.office?.address ?? '',

    currency: total.total.currency,
    goodsMinor: total.goods.amountMinor,
    shippingMinor: total.shipping.amountMinor,
    codFeeMinor: total.codFee?.amountMinor ?? null,
    totalMinor: total.total.amountMinor,
    weightGrams: total.weightGrams,

    paymentMethod: draft.paymentMethod,
  }

  try {
    /**
     * One batch, which the HTTP driver sends as a single transaction — so an
     * order never exists without its lines. `db.transaction()` is not available
     * on this driver (see `src/db/index.ts`), and three separate requests would
     * leave a half-written order behind whenever the second one failed.
     */
    await db.batch([
      db.insert(orders).values(orderRow),
      db.insert(orderItems).values(buildItemRows(id, total)),
      db.insert(orderEvents).values({
        orderId: id,
        // Null, not 'draft': the order was created *in* this status. Recording a
        // transition that never happened would be a lie in the audit trail.
        fromStatus: null,
        toStatus: status,
        actor: 'system',
        detail: {
          source: 'checkout',
          paymentMethod: draft.paymentMethod,
          courier: delivery.courier,
          deliveryMethod: delivery.method,
          totalMinor: total.total.amountMinor,
          currency: total.total.currency,
          freeShipping: total.freeShipping,
          // Whether the office code was confirmed against the courier, or taken
          // on trust because the courier could not be reached. Read this before
          // printing a waybill.
          officeVerified: draft.officeVerified ?? false,
        },
      }),
    ])
  } catch (error) {
    // The other half of the idempotency guarantee: two simultaneous submissions
    // of one intent race, the loser's whole batch is rolled back by the unique
    // index on `intent_token`, and it answers with the winner's order rather
    // than with an error the customer cannot act on.
    const winner = await findByIntent(draft.intentToken)
    if (winner) return { ...winner, duplicate: true }
    throw error
  }

  return { id, orderNumber, publicToken, status, duplicate: false }
}

/** The order this intent token already created, if any. */
async function findByIntent(
  intentToken: string
): Promise<Omit<PlacedOrder, 'duplicate'> | undefined> {
  const [row] = await getDb()
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      publicToken: orders.publicToken,
      status: orders.status,
    })
    .from(orders)
    .where(eq(orders.intentToken, intentToken))
    .limit(1)

  return row
}

/**
 * The next value of the order-number counter.
 *
 * Its own round trip rather than a default on the column, because the number is
 * wanted in the returned `PlacedOrder` and in the confirmation the customer
 * reads, and reading it back would cost the same request. `nextval` is atomic;
 * see `orderNumberSeq` in `src/db/schema.ts` for why gaps are acceptable.
 */
async function nextCounter(): Promise<number> {
  const result = await getDb().execute<{ value: string | number }>(
    sql`select nextval('order_number_seq') as value`
  )

  // Postgres `bigint` arrives as a string from the driver, so parse rather than
  // trusting the type: `'42'.padStart()` would silently produce a valid-looking
  // order number from a value nobody checked.
  const value = Number(result.rows[0]?.value)

  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`order_number_seq returned an unusable value: ${result.rows[0]?.value}`)
  }

  return value
}
