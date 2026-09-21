import 'server-only'

import { eq, sql } from 'drizzle-orm'

import { getDb } from '@/db'
import {
  invoices,
  orderEvents,
  orderItems,
  orders,
  type Invoice,
  type Order,
  type OrderItem,
  type OrderStatus,
} from '@/db/schema'
import { company, formatAddress, isTodo } from './company'
import { CURRENCY, type Currency } from './money'

/**
 * Issuing a фактура (AUDIT.md Q-27, Phase 7).
 *
 * Two properties make this different from every other write in the shop, and both
 * come from the law rather than from us:
 *
 * 1. **The numbering may not have gaps.** Ten digits, ascending, no duplicates,
 *    nothing missing. So the number and the document appear together or not at
 *    all — see `documentCounters` in `src/db/schema.ts` for why that rules out a
 *    Postgres sequence, and `issueInvoiceForOrder()` for the single statement that
 *    keeps the promise without a transaction the HTTP driver cannot give us.
 * 2. **An issued invoice is immutable.** It exists in somebody else's accounting
 *    by the time anyone reconsiders, so this module has no update path. Everything
 *    the document says is frozen in `snapshot` at issue time, the seller's own
 *    details included: the day the registered seat changes, last year's invoices
 *    must still show last year's seat.
 *
 * What it is *not*: a fiscal receipt. Whether cash collected by a courier needs a
 * касов бон under Наредба Н-18 is a question for the owner's accountant and is
 * recorded as open in AUDIT.md — an invoice does not answer it either way.
 *
 * Nothing here is reachable without `requireAdmin()`.
 */

/**
 * Statuses an invoice may be issued in.
 *
 * From `confirmed`, because a Bulgarian shop commonly puts the фактура in the
 * parcel, so it has to be printable before the goods move. Through `reconciled`,
 * because a customer may ask for one months later.
 *
 * Nothing after an unhappy ending: `refused_at_delivery`, `returned`, `cancelled`
 * and the refund states are sales that did not happen or were undone, and undoing
 * an invoice takes a credit note (кредитно известие), which this module does not
 * issue. Better to refuse than to create a document that needs a second document
 * nobody built yet.
 */
export const INVOICEABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  'confirmed',
  'packed',
  'shipped',
  'delivered',
  'cod_collected',
  'reconciled',
] as const

/**
 * Ten digits, zero-padded, as the series is printed and entered.
 *
 * Inlined into the SQL with `sql.raw` rather than bound as a parameter: it is a
 * constant of ours, and `lpad($1, $2, '0')` makes the driver guess the type of a
 * literal integer it does not need to.
 */
const NUMBER_DIGITS = 10

/**
 * Who issues the document, by name.
 *
 * `ЗСч` requires a natural person's name on a primary accounting document, and
 * `company.manager` is deliberately `null` — the owner does not publish their name
 * on the open web, which is lawful because the Търговски регистър has it against
 * the ЕИК. An invoice is not the open web: it goes to one customer and to an
 * accountant, so the name belongs on it.
 *
 * Hence configuration, exactly like `ECONT_SENDER_PHONE`. `company.manager` wins
 * if the owner ever does publish it, so the two cannot disagree.
 */
const ISSUER_VAR = 'INVOICE_ISSUER_NAME'

export function invoiceIssuer(): string | null {
  // `|| null` and not `?? null`: an env var set to whitespace is unset as far as a
  // document is concerned, and `''` under „съставил“ is worse than no invoice.
  return company.manager ?? (process.env[ISSUER_VAR]?.trim() || null)
}

/**
 * The buyer, as the invoice will name them.
 *
 * Defaults come from the order, but they are only defaults: a customer asking for
 * an invoice for their company gives details the checkout never collected — фирма,
 * ЕИК, МОЛ, an address that is not where the parcel went. That is why this is an
 * input to issuing rather than something derived from the order.
 */
export interface InvoiceBuyer {
  /** Physical person, or the contact person of a company. */
  name: string
  /** Фирма, when the invoice is to a company rather than to a person. */
  company?: string
  /** ЕИК/Булстат. */
  eik?: string
  /** ДДС номер, when the buyer has one. */
  vatNumber?: string
  /** Материално отговорно лице, when the buyer is a company. */
  accountable?: string
  /** Free-form, because a registered address is one line in the register. */
  address?: string
}

/** The buyer as the order knows them: a person at the delivery address. */
export function defaultBuyerFor(order: Order): InvoiceBuyer {
  const place =
    order.deliveryMethod === 'door'
      ? [order.street, `${order.postCode} ${order.city}`.trim()]
      : [order.officeName && `Офис ${order.officeName}`, `${order.postCode} ${order.city}`.trim()]

  return {
    name: order.recipientName,
    address: place.filter(Boolean).join(', '),
  }
}

/** One line of the document. Minor units, like everywhere else. */
export interface InvoiceLine {
  name: string
  productSlug: string
  quantity: number
  unitPriceMinor: number
  lineTotalMinor: number
}

/**
 * The document, exactly as issued.
 *
 * Amounts stay integer minor units rather than formatted strings: formatting is
 * deterministic from these and a locale, and a stored string would be a second
 * copy of the same fact that could disagree with the first. `version` is here so
 * a reader added in two years knows which shape it is looking at.
 */
export interface InvoiceSnapshot {
  version: 1
  number: string
  issuedAt: string
  /** ISO date of the данъчно събитие, or null while the goods have not moved. */
  saleDate: string | null
  orderNumber: string
  orderPlacedAt: string
  seller: {
    legalName: string
    eik: string
    vatNumber: string | null
    address: string
    /** Място на издаване — the seat's city, printed on its own line. */
    city: string
    email: string
    tradingName: string
  }
  buyer: InvoiceBuyer
  lines: readonly InvoiceLine[]
  money: {
    currency: Currency
    goodsMinor: number
    discountMinor: number
    promoCode: string
    shippingMinor: number
    /** Null when the shop absorbed it, which is then simply not on the invoice. */
    codFeeMinor: number | null
    totalMinor: number
  }
  /** Why no VAT is charged. Printed verbatim; see `VAT_BASIS`. */
  vatNote: string
  /** How it is paid. One method today, but the document must say which. */
  paymentNote: string
  issuedBy: string
}

/**
 * Основание за неначисляване на ДДС.
 *
 * The company is not VAT-registered (`company.isVatRegistered`), and a
 * non-registered person may not show ДДС on an invoice — ЗДДС чл. 113, ал. 9. An
 * invoice with neither a VAT amount nor a reason for its absence looks like one
 * where the VAT was forgotten, so the reason is printed on every line of the
 * series.
 *
 * `[VERIFY WITH ACCOUNTANT]` covers the wording only. That the shop charges no VAT
 * is settled and already stated in the price terms (`messages/bg.json`).
 */
const VAT_BASIS = 'Не се начислява ДДС на основание чл. 113, ал. 9 от ЗДДС'

const VAT_BASIS_REGISTERED =
  '[TODO: дружеството е регистрирано по ЗДДС — фактурата трябва да начислява данък]'

/** Наложен платеж is the only method, and the invoice has to name it. */
const PAYMENT_NOTE = 'Наложен платеж (в брой при доставка)'

/**
 * Build the document from an order. Pure, so it is the part that gets tested.
 *
 * `number` is passed in rather than read here: it comes from the same SQL
 * statement that stores the row, because a number minted in JavaScript and then
 * failing to be stored is exactly the gap the series may not have.
 */
export function invoiceSnapshot(input: {
  order: Order
  items: readonly OrderItem[]
  buyer: InvoiceBuyer
  number: string
  issuedAt: Date
  issuedBy: string
}): InvoiceSnapshot {
  const { order, items, buyer, number, issuedAt, issuedBy } = input

  // Дата на данъчното събитие: when the goods actually changed hands. Not the
  // order date, and not today — an invoice printed for the parcel has no such
  // date yet, and inventing one would date the sale before it happened.
  const sale = order.deliveredAt ?? order.codCollectedAt ?? null

  return {
    version: 1,
    number,
    issuedAt: issuedAt.toISOString(),
    saleDate: sale ? sale.toISOString() : null,
    orderNumber: order.orderNumber,
    orderPlacedAt: order.createdAt.toISOString(),
    seller: {
      legalName: company.legalName,
      eik: company.eik,
      vatNumber: company.vatNumber,
      address: formatAddress('bg'),
      city: company.address.city,
      email: company.contact.email,
      tradingName: company.tradingName,
    },
    buyer: prunedBuyer(buyer),
    lines: items.map((item) => ({
      name: item.name,
      productSlug: item.productSlug,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor: item.lineTotalMinor,
    })),
    money: {
      currency: order.currency as Currency,
      goodsMinor: order.goodsMinor,
      discountMinor: order.discountMinor,
      promoCode: order.promoCode,
      shippingMinor: order.shippingMinor,
      codFeeMinor: order.codFeeMinor,
      totalMinor: order.totalMinor,
    },
    vatNote: company.isVatRegistered ? VAT_BASIS_REGISTERED : VAT_BASIS,
    paymentNote: PAYMENT_NOTE,
    issuedBy,
  }
}

/**
 * Drop the empty optional fields instead of storing `''` for them.
 *
 * The renderer shows a row for every field the buyer block has, so an empty
 * string would print `ЕИК:` followed by nothing — which reads as a missing
 * detail on a document where missing details matter.
 */
function prunedBuyer(buyer: InvoiceBuyer): InvoiceBuyer {
  const text = (value: string | undefined) => value?.trim() || undefined

  return {
    name: buyer.name.trim(),
    ...(text(buyer.company) ? { company: text(buyer.company) } : {}),
    ...(text(buyer.eik) ? { eik: text(buyer.eik) } : {}),
    ...(text(buyer.vatNumber) ? { vatNumber: text(buyer.vatNumber) } : {}),
    ...(text(buyer.accountable) ? { accountable: text(buyer.accountable) } : {}),
    ...(text(buyer.address) ? { address: text(buyer.address) } : {}),
  }
}

export type InvoiceBlocker =
  /** One invoice per order. Carries the number, so the admin sees which. */
  | { reason: 'alreadyIssued'; number: string }
  /** Too early, or a sale that was undone. See `INVOICEABLE_ORDER_STATUSES`. */
  | { reason: 'wrongStatus'; status: OrderStatus }
  /** The seller's own details are not complete enough to put on a document. */
  | { reason: 'sellerIncomplete'; missing: string[] }

/**
 * Why this order cannot be invoiced, or `null` when it can.
 *
 * Pure, and checked twice on purpose — once so the page can explain itself and
 * once in the action, because a check made only in the UI is not a check.
 */
export function invoiceBlocker(order: Order, existing: Invoice | null): InvoiceBlocker | null {
  if (existing) return { reason: 'alreadyIssued', number: existing.number }

  if (!INVOICEABLE_ORDER_STATUSES.includes(order.status)) {
    return { reason: 'wrongStatus', status: order.status }
  }

  const missing = missingSellerDetails()
  if (missing.length > 0) return { reason: 'sellerIncomplete', missing }

  return null
}

/**
 * What the seller still owes the document.
 *
 * A фактура carries the issuer's identity, seat and ЕИК, and a name for whoever
 * drew it up. A `[TODO: …]` marker on a legal document is worse than no document:
 * the customer gets paperwork their accountant will reject.
 */
export function missingSellerDetails(): string[] {
  const missing: string[] = []

  if (isTodo(company.legalName)) missing.push('company.legalName')
  if (isTodo(company.eik)) missing.push('company.eik')

  const { street, city, postalCode } = company.address
  if (isTodo(street) || isTodo(city) || isTodo(postalCode)) missing.push('company.address')

  if (invoiceIssuer() === null) missing.push(ISSUER_VAR)

  return missing
}

export type InvoiceOutcome =
  | { status: 'ok'; number: string; issuedAt: Date }
  | { status: 'missing' }
  | { status: 'blocked'; blocker: InvoiceBlocker }
  | { status: 'failed'; reason: string }

/** The invoice for one order, or null. */
export async function getInvoiceForOrder(orderId: string): Promise<Invoice | null> {
  const [invoice] = await getDb()
    .select()
    .from(invoices)
    .where(eq(invoices.orderId, orderId))
    .limit(1)

  return invoice ?? null
}

/**
 * Issue the invoice for one order.
 *
 * The number and the row are created by **one** statement, which is what makes the
 * series gap-free on a driver with no transactions (`src/db/index.ts`): the
 * counter is bumped in a CTE, the number is formatted from it in SQL, and the
 * insert selects from that CTE. Postgres runs the whole thing atomically, so
 *
 * - two admins pressing at once serialise on the counter row and get consecutive
 *   numbers, never the same one;
 * - a second press for an order that already has one violates
 *   `invoices_order_id_idx`, and the failed insert takes the bump down with it —
 *   so a duplicate attempt does not burn a number;
 * - the number is written into the stored snapshot by `jsonb_set`, so the document
 *   and its number cannot disagree.
 *
 * `ON CONFLICT` on the counter rather than a seeded row, so a fresh database needs
 * no data migration to start the series at 1.
 */
export async function issueInvoiceForOrder(
  orderId: string,
  buyer: InvoiceBuyer
): Promise<InvoiceOutcome> {
  const db = getDb()

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  if (!order) return { status: 'missing' }

  const existing = await getInvoiceForOrder(orderId)
  const blocker = invoiceBlocker(order, existing)
  if (blocker) return { status: 'blocked', blocker }

  const issuer = invoiceIssuer()
  // `invoiceBlocker` has already established this; narrowing, not a second check.
  if (!issuer) return { status: 'blocked', blocker: { reason: 'sellerIncomplete', missing: [ISSUER_VAR] } }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId))
  const issuedAt = new Date()

  // Built with a placeholder number and then corrected in SQL — see the docblock.
  // Nothing reads this copy of the field; `jsonb_set` overwrites it.
  const snapshot = invoiceSnapshot({
    order,
    items,
    buyer,
    number: '',
    issuedAt,
    issuedBy: issuer,
  })

  const sale = snapshot.saleDate

  try {
    const inserted = await db.execute<{ number: string }>(sql`
      with bumped as (
        insert into document_counters (name, value, updated_at)
        values ('invoice', 1, now())
        on conflict (name) do update
          set value = document_counters.value + 1, updated_at = now()
        returning value
      ),
      minted as (
        select lpad(value::text, ${sql.raw(String(NUMBER_DIGITS))}, '0') as number from bumped
      )
      insert into invoices (number, order_id, issued_at, sale_date, total_minor, currency, snapshot)
      select
        minted.number,
        ${orderId}::uuid,
        ${issuedAt.toISOString()}::timestamptz,
        ${sale}::timestamptz,
        ${order.totalMinor},
        ${order.currency},
        jsonb_set(${JSON.stringify(snapshot)}::jsonb, '{number}', to_jsonb(minted.number))
      from minted
      returning number
    `)

    const number = String(inserted.rows[0]?.number ?? '')

    if (!number) {
      // No row came back from an insert that did not throw: nothing was stored,
      // and no number was consumed, but this should not be possible.
      console.error(`[invoices] insert for order ${order.orderNumber} returned no number`)
      return { status: 'failed', reason: 'the invoice was not stored' }
    }

    await note(orderId, order.status, { invoiceNumber: number, issuedBy: issuer })

    return { status: 'ok', number, issuedAt }
  } catch (error) {
    // The expected failure is the unique index on `order_id`: somebody issued one
    // between our read and our write. That is not an error the admin caused, and
    // the document that exists is the right answer.
    const raced = await getInvoiceForOrder(orderId)
    if (raced) return { status: 'blocked', blocker: { reason: 'alreadyIssued', number: raced.number } }

    const reason = error instanceof Error ? error.message : String(error)
    console.error(`[invoices] could not issue for order ${order.orderNumber}: ${reason}`)

    return { status: 'failed', reason }
  }
}

/**
 * Append a note to the order's history without moving it.
 *
 * Same shape as the waybill note in `src/lib/waybills.ts`: `order_events` is the
 * audit trail for everything that happens to an order, and a row whose statuses
 * match reads as "this happened while the order sat here".
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
      detail: { source: 'invoice', ...detail },
    })
}

/**
 * The stored jsonb, read defensively.
 *
 * The column is typed `unknown`, and the renderer must not `as`-cast it: a row
 * written by an older version of this code is exactly what a version field is for.
 */
export function readSnapshot(value: unknown): InvoiceSnapshot | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<InvoiceSnapshot>

  if (candidate.version !== 1) return null
  if (typeof candidate.number !== 'string' || !candidate.seller || !candidate.money) return null
  if (!Array.isArray(candidate.lines)) return null

  return candidate as InvoiceSnapshot
}

/** The currency of a stored snapshot, defaulting to the shop's own. */
export function snapshotCurrency(snapshot: InvoiceSnapshot): Currency {
  return snapshot.money.currency ?? CURRENCY
}
