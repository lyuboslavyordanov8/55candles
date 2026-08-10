import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
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
 * The full order lifecycle, card and наложен платеж alike.
 *
 * The COD branch is modelled separately on purpose. A COD order is *not* paid
 * at checkout — the courier collects on delivery and remits later — so
 * collapsing it into `paid` would misstate the books and hide unreconciled
 * money. See AUDIT.md B-14.
 *
 *   draft ─┬─ pending_payment ─ paid ─┬─ packed ─ shipped ─ delivered
 *          │        └ payment_failed  │
 *          └─ awaiting_cod ─ confirmed┘
 *
 *   delivered ─ cod_collected ─ reconciled     (COD only)
 *   shipped   ─ refused_at_delivery ─ returned
 *   any       ─ cancelled | refunded | partially_refunded
 */
export const orderStatus = pgEnum('order_status', [
  'draft',
  // Card
  'pending_payment',
  'payment_failed',
  'paid',
  // COD
  'awaiting_cod',
  'confirmed',
  // Fulfilment
  'packed',
  'shipped',
  'delivered',
  // COD settlement
  'cod_collected',
  'reconciled',
  // Unhappy endings
  'refused_at_delivery',
  'returned',
  'cancelled',
  'refunded',
  'partially_refunded',
])

export const paymentMethod = pgEnum('payment_method', ['card', 'cod'])
export const courier = pgEnum('courier', ['econt', 'speedy'])
export const deliveryMethod = pgEnum('delivery_method', ['door', 'office', 'locker'])

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
    shippingMinor: integer('shipping_minor').notNull(),
    /** Null when the merchant absorbs it (Q-23). */
    codFeeMinor: integer('cod_fee_minor'),
    totalMinor: integer('total_minor').notNull(),
    /** Billable parcel weight used to pick the courier band. */
    weightGrams: integer('weight_grams').notNull(),

    // --- Payment ---
    paymentMethod: paymentMethod('payment_method').notNull(),
    /**
     * Set only from the Stripe webhook, never from the client redirect — a
     * customer can navigate to the success URL directly (AUDIT.md B-11).
     */
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    paidAt: timestamp('paid_at', { withTimezone: true }),

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

    /** Who caused it: 'system', 'webhook:stripe', 'admin', 'courier'. */
    actor: text('actor').notNull().default('system'),
    /** Free-form context — decline code, courier response, admin note. */
    detail: jsonb('detail'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('order_events_order_id_idx').on(table.orderId)]
)

// ---------------------------------------------------------------------------
// Stripe webhook replay protection
// ---------------------------------------------------------------------------

/**
 * Stripe retries deliveries and can send the same event more than once. The
 * handler inserts the event id first; a unique violation means "already
 * processed", so it returns 200 and stops rather than marking an order paid
 * twice or refunding twice (AUDIT.md B-11).
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stripe's `evt_…` id. */
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload'),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('webhook_events_event_id_idx').on(table.eventId)]
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
// Inferred types
// ---------------------------------------------------------------------------

export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type OrderItem = typeof orderItems.$inferSelect
export type NewOrderItem = typeof orderItems.$inferInsert
export type OrderEvent = typeof orderEvents.$inferSelect
export type NewOrderEvent = typeof orderEvents.$inferInsert
export type OrderStatus = (typeof orderStatus.enumValues)[number]
