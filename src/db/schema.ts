import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Order storage (AUDIT.md B-01, B-08, B-09).
 *
 * Three rules this schema exists to enforce:
 *
 * 1. **Money is integer minor units.** Never `numeric`, never a float. Every
 *    amount column is cents, paired with a currency, matching `Money` in
 *    src/lib/money.ts.
 * 2. **Line items are a snapshot, not a reference.** `order_items` copies the
 *    name, unit price, VAT rate and weight as they were at purchase. Editing a
 *    product later must not rewrite history — an order is a financial record
 *    and an invoice is generated from it.
 * 3. **Status changes only through `order_events`.** The append-only log is the
 *    audit trail; `orders.status` is a cached read of its most recent entry.
 *
 * Guest checkout only (Q-31). There is no users table and no `user_id` on
 * orders, so accounts can be added later without migrating anything: a future
 * `user_id` is a nullable column, not a restructure.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * The order lifecycle of a наложен платеж shop.
 *
 * There is no `paid` state, and that is deliberate. Cash on delivery is the only
 * payment method (`src/lib/payments.ts`), so money never arrives at checkout: the
 * courier collects it on delivery and remits it later. Calling a delivered order
 * "paid" would misstate the books and hide money that is owed to the shop but not
 * yet in its account, so settlement is its own two steps — the courier says it
 * collected, and the remittance is then reconciled against the statement (B-14).
 *
 *   draft ─ awaiting_cod ─ confirmed ─ packed ─ shipped ─ delivered
 *                                                            └ cod_collected ─ reconciled
 *   shipped ─ refused_at_delivery ─ returned
 *   any     ─ cancelled | refunded | partially_refunded
 *
 * `refunded` survives without card payments: a return after the cash has been
 * collected is repaid by bank transfer, and it is still a refund.
 */
export const orderStatus = pgEnum('order_status', [
  'draft',
  // Placed
  'awaiting_cod',
  'confirmed',
  // Fulfilment
  'packed',
  'shipped',
  'delivered',
  // Settlement
  'cod_collected',
  'reconciled',
  // Unhappy endings
  'refused_at_delivery',
  'returned',
  'cancelled',
  'refunded',
  'partially_refunded',
])

/**
 * One value today, kept as an enum rather than dropped.
 *
 * The order records how it was to be paid, so the books do not depend on
 * remembering that there was only ever one way. A second method is then
 * `ALTER TYPE … ADD VALUE`, which touches no existing row.
 */
export const paymentMethod = pgEnum('payment_method', ['cod'])
export const courier = pgEnum('courier', ['econt', 'speedy'])
export const deliveryMethod = pgEnum('delivery_method', ['door', 'office', 'locker'])

// ---------------------------------------------------------------------------
// Order numbers
// ---------------------------------------------------------------------------

/**
 * Counter behind the human-facing order number, e.g. 55C-2026-000123.
 *
 * A sequence rather than `max(order_number) + 1` or a row count: `nextval` is
 * atomic and never blocks, so two customers submitting in the same second
 * cannot be handed the same number. The cost is that it is *not* gap-free —
 * a rolled-back insert consumes its value — which is the right trade here,
 * because the number is a reference for humans and the paperwork, not a legal
 * numbering series. (An invoice series, if one is ever issued, has its own
 * gap-free requirement under Наредба Н-18 and must not reuse this.)
 *
 * It does not restart each year either: the year in the printed number comes
 * from the order's date, while the counter keeps climbing, so a number is
 * unique on its own and `55C-2027-000500` can follow `55C-2026-000499`.
 * Per-year restarts would need one sequence per year and buy nothing.
 *
 * Read through `nextOrderNumber()` in `src/lib/orders.ts`; nothing else should
 * call `nextval` on it.
 */
export const orderNumberSeq = pgSequence('order_number_seq', {
  startWith: 1,
  increment: 1,
})

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Human-facing reference, e.g. 55C-2026-000123. Never the primary key. */
    orderNumber: text('order_number').notNull(),

    /**
     * Idempotency key, minted when the checkout page loads and replayed with
     * the submission. The unique index on it is what makes a double-click or a
     * refresh return the existing order instead of creating a second one
     * (AUDIT.md B-09).
     */
    intentToken: text('intent_token').notNull(),

    /**
     * Opaque token for guest order lookup. Confirmation and tracking pages are
     * addressed by (order_number, public_token) so that order numbers, which
     * are sequential and printed on paperwork, are not enough on their own to
     * read someone else's address and phone number.
     */
    publicToken: text('public_token').notNull(),

    status: orderStatus('status').notNull().default('draft'),

    // --- Contact and delivery, snapshotted at purchase ---
    recipientName: text('recipient_name').notNull(),
    phone: text('phone').notNull(),
    email: text('email').notNull().default(''),

    /**
     * ISO-3166-1 alpha-2. Bulgaria only for now (Q-07), enforced in
     * application code against SHIPPING_COUNTRIES rather than by a check
     * constraint, so opening a new market is a one-line change and not a
     * migration. Stored regardless, so "we only shipped to BG" stays a fact
     * about the data rather than tribal knowledge.
     */
    country: text('country').notNull().default('BG'),
    city: text('city').notNull(),
    postCode: text('post_code').notNull(),
    /** Populated for door delivery. */
    street: text('street').notNull().default(''),
    note: text('note').notNull().default(''),

    // --- Courier ---
    courier: courier('courier').notNull(),
    deliveryMethod: deliveryMethod('delivery_method').notNull(),
    /**
     * Office/APS snapshot. The id alone is not enough: offices close, and a
     * closed office id resolves to nothing when you print the label weeks
     * later, so the human-readable name and address are copied too.
     */
    officeId: text('office_id').notNull().default(''),
    officeName: text('office_name').notNull().default(''),
    officeAddress: text('office_address').notNull().default(''),

    // --- Money, all integer minor units ---
    currency: text('currency').notNull().default('EUR'),
    goodsMinor: integer('goods_minor').notNull(),
    /**
     * Promo discount taken off the goods (AUDIT.md Q-37). Zero on most orders.
     *
     * Its own column, not folded into `goods_minor`: the invoice has to show the
     * price the customer agreed to and the discount off it as separate lines, and
     * a net figure cannot be reconciled against the price they were shown.
     */
    discountMinor: integer('discount_minor').notNull().default(0),
    /**
     * The code that produced the discount, canonical and empty when none. Kept so
     * a campaign can be counted afterwards — the discount alone does not say which
     * promotion paid for itself.
     */
    promoCode: text('promo_code').notNull().default(''),
    /** What the customer pays for delivery. Zero on a free-delivery order. */
    shippingMinor: integer('shipping_minor').notNull(),
    /** Null when the merchant absorbs it (Q-23). */
    codFeeMinor: integer('cod_fee_minor'),
    totalMinor: integer('total_minor').notNull(),
    /** Billable parcel weight used to pick the courier band. */
    weightGrams: integer('weight_grams').notNull(),

    // --- Payment ---
    paymentMethod: paymentMethod('payment_method').notNull(),
    /**
     * When the courier reported collecting the cash — not when it was delivered,
     * and not when the money reached the shop's account. Reconciliation against
     * the courier's remittance is the `reconciled` status, and until then this is
     * a claim by the courier rather than a receipt (AUDIT.md B-14).
     */
    codCollectedAt: timestamp('cod_collected_at', { withTimezone: true }),

    // --- Fulfilment ---
    waybillNumber: text('waybill_number'),
    trackingUrl: text('tracking_url'),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('orders_order_number_idx').on(table.orderNumber),
    // The idempotency guarantee.
    uniqueIndex('orders_intent_token_idx').on(table.intentToken),
    index('orders_status_idx').on(table.status),
    index('orders_created_at_idx').on(table.createdAt),
    // Reconciliation looks orders up by waybill when the courier payout lands.
    index('orders_waybill_idx').on(table.waybillNumber),
  ]
)

// ---------------------------------------------------------------------------
// Order items — the immutable snapshot
// ---------------------------------------------------------------------------

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    /** Reference only. Everything needed to render or invoice is copied below. */
    productSlug: text('product_slug').notNull(),

    /** Copied at purchase. Renaming the product must not alter past orders. */
    name: text('name').notNull(),
    unitPriceMinor: integer('unit_price_minor').notNull(),
    currency: text('currency').notNull().default('EUR'),
    quantity: integer('quantity').notNull(),
    lineTotalMinor: integer('line_total_minor').notNull(),

    /** Per-unit, as used for the shipping band at the time. */
    unitWeightGrams: integer('unit_weight_grams').notNull(),

    /**
     * VAT rate in basis points (2000 = 20%), so the invoice can be regenerated
     * exactly even if the rate or the registration status later changes.
     * Nullable while the VAT position is unresolved (Q-03).
     */
    vatRateBasisPoints: integer('vat_rate_basis_points'),
  },
  (table) => [index('order_items_order_id_idx').on(table.orderId)]
)

// ---------------------------------------------------------------------------
// Order events — append-only audit trail
// ---------------------------------------------------------------------------

export const orderEvents = pgTable(
  'order_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    fromStatus: orderStatus('from_status'),
    toStatus: orderStatus('to_status').notNull(),

    /** Who caused it: 'system', 'admin', 'courier'. */
    actor: text('actor').notNull().default('system'),
    /** Free-form context — decline code, courier response, admin note. */
    detail: jsonb('detail'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('order_events_order_id_idx').on(table.orderId)]
)

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

/**
 * Marketing consent, kept deliberately apart from orders (AUDIT.md B-18).
 *
 * Buying something is not consent to be marketed at, so this must never be
 * inferred from an order. Each grant and withdrawal is its own row: proving
 * consent means proving what was agreed, when, and against which version of
 * the policy.
 */
export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    /** e.g. 'marketing_email'. */
    purpose: text('purpose').notNull(),
    granted: boolean('granted').notNull(),
    /** Version of the privacy/cookie policy shown at the time. */
    policyVersion: text('policy_version').notNull().default(''),
    /** Evidence of the act; a truncated IP is enough and stores less. */
    ipAddress: text('ip_address'),
    source: text('source').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('consent_records_email_idx').on(table.email)]
)

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

/**
 * Counters for numbering series that may not have gaps.
 *
 * A table and not a `pgSequence`, which is the opposite of the choice made for
 * order numbers above — and for the opposite reason. `nextval` is deliberately
 * non-transactional: a rolled-back insert keeps its value, so the series grows
 * holes. An order number may have holes; a **фактура** number may not. Bulgarian
 * law requires the invoice series to be ten digits, ascending, without duplicates
 * and **without gaps**, which means the number and the document it belongs to have
 * to appear or fail together.
 *
 * So the counter is an ordinary row, bumped with `UPDATE … RETURNING` inside the
 * same statement that inserts the invoice — see `issueInvoiceForOrder()`. The row
 * lock serialises two admins pressing the button at once, and because it is one
 * statement, a failed insert takes the bump down with it.
 *
 * Keyed by name so a second series (кредитно известие, ако някога потрябва) is a
 * row and not a migration.
 */
export const documentCounters = pgTable('document_counters', {
  /** e.g. 'invoice'. */
  name: text('name').primaryKey(),
  /** Last number handed out. The next invoice is `value + 1`. */
  value: integer('value').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * One issued invoice (фактура).
 *
 * Append-only by intent: an issued invoice is a document that exists in the
 * outside world, so it is never edited and never deleted. Correcting one means
 * issuing a credit note against it, which is why there is no `updatedAt` here
 * and no status column — a row in this table means "this document was issued".
 *
 * Everything the document says lives in `snapshot`, including the seller's own
 * details. Reading the company from `src/lib/company.ts` at render time would
 * quietly reprint last year's invoices with this year's address the day the seat
 * changes; an invoice has to keep saying what it said when it was issued.
 */
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * The ten-digit series, zero-padded, e.g. `0000000001`. Text, not a number:
     * the leading zeros are part of the number as printed and as the accountant
     * enters it.
     */
    number: text('number').notNull(),
    /**
     * One invoice per order, enforced by the unique index below. That constraint
     * is also what makes double-clicking the button safe: the second insert
     * fails, and with it the counter bump in the same statement.
     */
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    /** Дата на издаване. */
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Дата на данъчното събитие — when the goods changed hands, which for a
     * наложен платеж shop is the delivery and not the order. Nullable because an
     * invoice may accompany the parcel, and then the date is not yet known.
     */
    saleDate: timestamp('sale_date', { withTimezone: true }),
    /** Denormalised for the admin list, so it need not parse the snapshot. */
    totalMinor: integer('total_minor').notNull(),
    currency: text('currency').notNull().default('EUR'),
    /** The whole document, as issued. See `InvoiceSnapshot` in `src/lib/invoices.ts`. */
    snapshot: jsonb('snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('invoices_number_idx').on(table.number),
    uniqueIndex('invoices_order_id_idx').on(table.orderId),
    index('invoices_issued_at_idx').on(table.issuedAt),
  ]
)

/**
 * One проформа фактура.
 *
 * Deliberately *not* a row in `invoices` with a flag, and deliberately not tied
 * to an order:
 *
 * - **It is not an accounting document.** A проформа is an offer to pay, so it
 *   carries no данъчно събитие, consumes none of the invoice series, and needs no
 *   credit note to undo. Putting it in `invoices` would mean loosening the
 *   constraints that keep that series lawful for the sake of a document the law
 *   does not count.
 * - **It has no order.** These are written for the enquiries that arrive *before*
 *   an order exists — a bigger wholesale lot, a custom batch of candles — where
 *   the customer needs a document to pay against or to get an approval with. So
 *   the buyer and the lines are typed in, not derived.
 *
 * Same immutability as an invoice, for a different reason: it was sent to
 * somebody. A wrong проформа is superseded by a new one, never edited, which is
 * why there is no `updatedAt` here either.
 *
 * `invoiceId` is where the фактура lands when one of these is paid and the
 * conversion is built. Null until then, and null forever for the ones that come
 * to nothing — which is most of what a quote does.
 */
export const proformas = pgTable(
  'proformas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Its own series, from the `'proforma'` counter. See `documentCounters`. */
    number: text('number').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    /** After this date the prices on it are no longer offered. */
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    totalMinor: integer('total_minor').notNull(),
    currency: text('currency').notNull().default('EUR'),
    /** The document exactly as issued, seller and bank details included. */
    snapshot: jsonb('snapshot').notNull(),
    /** The фактура issued against it, once that exists. */
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('proformas_number_idx').on(table.number),
    index('proformas_issued_at_idx').on(table.issuedAt),
  ]
)

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type OrderItem = typeof orderItems.$inferSelect
export type NewOrderItem = typeof orderItems.$inferInsert
export type OrderEvent = typeof orderEvents.$inferSelect
export type NewOrderEvent = typeof orderEvents.$inferInsert
export type OrderStatus = (typeof orderStatus.enumValues)[number]
export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert

export type Proforma = typeof proformas.$inferSelect
export type NewProforma = typeof proformas.$inferInsert
