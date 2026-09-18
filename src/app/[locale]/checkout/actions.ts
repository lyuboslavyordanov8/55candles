'use server'

import { courierClient } from '@/lib/couriers'
import { validateDelivery, type DeliveryDetails, type FieldErrors } from '@/lib/delivery-schema'
import { calculateTotal, type CartLine } from '@/lib/order-total'
import { availablePaymentMethods, type PaymentMethod } from '@/lib/payments'
import { PAYMENT_METHODS } from '@/lib/payments'
import type { DeliveryOption } from '@/lib/shipping'

/**
 * Checkout submission (AUDIT.md Q-21, Q-25).
 *
 * Per the Next 16 Server Actions guide: an action is a POST endpoint reachable
 * by anyone who can send the request, so render-time gating is not a security
 * boundary and every input is untrusted. Two consequences are load-bearing
 * here:
 *
 * 1. **The cart is re-priced server-side** from slugs and quantities. The
 *    client never sends a price or a total; a browser that can name its own
 *    total can name zero.
 * 2. **Validation runs again here**, even though the form validates as you
 *    type, because the form is a convenience and this is the boundary.
 *
 * No order is persisted: there is no database yet (Q-34). The action therefore
 * stops at `readyToPay` and says so, rather than pretending an order exists.
 * That is the same principle as the contact form (B-20) — a visible refusal
 * beats a silent lie.
 */

/**
 * The fields whose values are sent back to the form after a submission.
 *
 * Only the ones the customer types. `courier`, `method`, the chosen office and
 * the city/post-code pair live in React state in the form and survive on their
 * own; these are plain uncontrolled inputs, and React clears those when an
 * action completes unless it is handed something to restore them to.
 */
export type EchoedField =
  | 'recipientName'
  | 'phone'
  | 'email'
  | 'street'
  | 'officeId'
  | 'note'
  | 'paymentMethod'

/**
 * Hard ceiling on an echoed value, in characters.
 *
 * Nothing to do with validation — every field's own limit is below this. It is
 * here so a request that posts a megabyte into `note` cannot make the response a
 * megabyte too. Comfortably above `LIMITS.note.max`, so an over-long value comes
 * back still over-long and the "too long" message it earned stays true.
 */
const ECHO_MAX = 1_000

export interface CheckoutState {
  status:
    | 'idle'
    /** Everything validated and priced; payment is the next step. */
    | 'readyToPay'
    | 'invalid'
    /** Prices, tariffs or a provider are not configured yet. */
    | 'unconfigured'
    | 'error'
  fieldErrors?: FieldErrors
  /**
   * What was submitted, sent straight back so the form can put it in the boxes
   * again. Present on every outcome: one wrong field must not cost the customer
   * the other eight, and even a successful submission has no order behind it yet
   * (Q-34), so wiping the form would lose details that are still needed.
   */
  values?: Partial<Record<EchoedField, string>>
  /** Human-readable message key, resolved by the client against `checkout`. */
  messageKey?: string
  /** Slugs with no price (B-03), for a specific message. */
  unpriced?: string[]
  /**
   * The collection point as the *courier* describes it, echoed back so the
   * customer confirms the right place before paying. Absent for door delivery,
   * and absent when the office could not be verified.
   */
  collectionPoint?: { name: string; address: string }
  summary?: {
    /**
     * The lines the server actually priced, so the breakdown can name each
     * candle rather than showing one "Candles" figure. Sent back rather than
     * read from the form on the client: these quantities are the ones the total
     * was computed from, and if the basket has since changed the form uses that
     * mismatch to hide a summary that no longer describes the order.
     */
    lines: Array<{
      slug: string
      quantity: number
      unitPriceMinor: number
      lineTotalMinor: number
    }>
    goodsMinor: number
    shippingMinor: number
    codFeeMinor: number | null
    totalMinor: number
    weightGrams: number
  }
}

export async function submitCheckout(
  _previous: CheckoutState,
  formData: FormData
): Promise<CheckoutState> {
  const raw = Object.fromEntries(formData) as Record<string, unknown>

  const delivery = validateDelivery(raw)

  const paymentMethod = String(raw.paymentMethod ?? '')
  const isKnownMethod = (PAYMENT_METHODS as readonly string[]).includes(paymentMethod)

  // Attached to every return below, including the successful one. Built from the
  // validated values rather than `raw`, so what comes back is trimmed and the
  // phone number is in its canonical form.
  const values = echo(delivery.value, paymentMethod)

  if (!delivery.valid || !isKnownMethod) {
    return {
      status: 'invalid',
      values,
      fieldErrors: delivery.errors,
      messageKey: isKnownMethod ? 'fixTheFields' : 'choosePayment',
    }
  }

  if (!availablePaymentMethods().includes(paymentMethod as PaymentMethod)) {
    // Card was submitted but Stripe is not configured. Reachable only by a
    // direct POST, since the UI hides unavailable methods.
    return { status: 'unconfigured', values, messageKey: 'paymentUnavailable' }
  }

  const office = await resolveOffice(delivery.value)

  if (office.status === 'unknown') {
    return {
      status: 'invalid',
      values,
      fieldErrors: { officeId: 'unknown' },
      messageKey: 'fixTheFields',
    }
  }

  let lines: CartLine[]
  try {
    lines = parseCart(raw.cart)
  } catch {
    return { status: 'error', values, messageKey: 'cartUnreadable' }
  }

  if (lines.length === 0) {
    return { status: 'invalid', values, messageKey: 'cartEmpty' }
  }

  const option: DeliveryOption = {
    courier: delivery.value.courier,
    method: delivery.value.method,
  }

  let total
  try {
    total = calculateTotal(lines, option, paymentMethod as PaymentMethod)
  } catch {
    // CartError — a quantity or slug that could only come from tampering.
    return { status: 'error', values, messageKey: 'cartUnreadable' }
  }

  if (total.status === 'incomplete') {
    return {
      status: 'unconfigured',
      values,
      unpriced: total.unpriced,
      messageKey: total.unpriced.length > 0 ? 'notPricedYet' : 'deliveryNotPricedYet',
    }
  }

  // [TODO: Q-34 — persist the order, then Q-20 — create the payment intent.]
  //
  // Order of operations when the database exists: write the order with status
  // `pending` *first*, then initiate payment with its reference. An order that
  // exists without a payment can be chased; a payment that exists without an
  // order is money received against nothing.
  //
  // Write `office.snapshot` to `orders.office_name` / `office_address`, **not**
  // the values that arrived in the form — those came from a client and a client
  // can say anything. `resolveOffice` has already replaced them with the
  // courier's own record wherever the courier could be reached.
  return {
    status: 'readyToPay',
    values,
    messageKey: 'noOrderStorageYet',
    ...(office.snapshot ? { collectionPoint: office.snapshot } : {}),
    summary: {
      lines: total.lines.map((line) => ({
        slug: line.slug,
        quantity: line.quantity,
        unitPriceMinor: line.unitPrice.amountMinor,
        lineTotalMinor: line.lineTotal.amountMinor,
      })),
      goodsMinor: total.goods.amountMinor,
      shippingMinor: total.shipping.amountMinor,
      codFeeMinor: total.codFee?.amountMinor ?? null,
      totalMinor: total.total.amountMinor,
      weightGrams: total.weightGrams,
    },
  }
}

/**
 * The values to put back in the form.
 *
 * Empty strings are dropped rather than sent as `''`: an absent key lets the
 * form fall back to its own default, which is what "the customer left this
 * blank" should mean, and it keeps the payload to the fields actually filled in.
 */
function echo(
  delivery: DeliveryDetails,
  paymentMethod: string
): Partial<Record<EchoedField, string>> {
  const submitted: Record<EchoedField, string> = {
    recipientName: delivery.recipientName,
    phone: delivery.phone,
    email: delivery.email,
    street: delivery.street,
    officeId: delivery.officeId,
    note: delivery.note,
    paymentMethod,
  }

  const values: Partial<Record<EchoedField, string>> = {}
  for (const [field, value] of Object.entries(submitted) as Array<[EchoedField, string]>) {
    if (value) values[field] = value.slice(0, ECHO_MAX)
  }

  return values
}

type OfficeResolution =
  /** Verified against the courier, or not applicable to this delivery method. */
  | { status: 'ok'; snapshot?: { name: string; address: string } }
  /** The courier answered, and has no office with that code. */
  | { status: 'unknown' }

/**
 * Re-check the chosen office server-side (AUDIT.md B-13 step 3).
 *
 * The picker showed a list that was correct when the page loaded. Offices close,
 * and a customer may be submitting a tab they opened yesterday — so the code is
 * checked again here, at the boundary, for the same reason prices are re-read
 * rather than trusted from the form.
 *
 * The two failure modes are treated differently on purpose:
 *
 * - **The courier answered and does not know the code** → reject. Accepting it
 *   produces a parcel with nowhere to go, discovered when the label is printed.
 * - **The courier could not be reached** → accept, keeping the customer's own
 *   value. A courier outage must not close the shop; the office is re-validated
 *   again before the waybill is created, which is the point where being wrong
 *   actually costs something.
 *
 * Also the moment the snapshot becomes trustworthy: on a successful lookup the
 * name and address are taken from the courier's record and the form's copies are
 * discarded.
 */
async function resolveOffice(delivery: DeliveryDetails): Promise<OfficeResolution> {
  if (delivery.method === 'door') return { status: 'ok' }

  const result = await courierClient(delivery.courier).findOffice(delivery.officeId)

  if (result.status === 'unconfigured') {
    // No credentials for this courier, so the customer typed the office into the
    // fallback field. There is nothing to check it against.
    return {
      status: 'ok',
      snapshot: delivery.officeName
        ? { name: delivery.officeName, address: delivery.officeAddress }
        : undefined,
    }
  }

  if (result.status === 'failed') {
    console.error(
      `[checkout] Could not verify ${delivery.courier} office ${delivery.officeId}: ` +
        `${result.reason}. Accepting the order; re-verify before creating the waybill.`
    )
    return {
      status: 'ok',
      snapshot: delivery.officeName
        ? { name: delivery.officeName, address: delivery.officeAddress }
        : undefined,
    }
  }

  if (!result.data) return { status: 'unknown' }

  return {
    status: 'ok',
    snapshot: { name: result.data.name, address: result.data.address },
  }
}

/**
 * Parse the cart from the form payload.
 *
 * Shape is `[{ slug, quantity }]`. Throws on anything else — a malformed cart
 * is not a validation error the customer can fix, so it is reported as an
 * error rather than as a field message.
 */
function parseCart(value: unknown): CartLine[] {
  if (typeof value !== 'string' || !value) return []

  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new Error('cart is not an array')

  return parsed.map((entry) => {
    if (typeof entry !== 'object' || entry === null) throw new Error('cart line is not an object')

    const { slug, quantity } = entry as Record<string, unknown>
    if (typeof slug !== 'string' || !slug) throw new Error('cart line has no slug')
    if (typeof quantity !== 'number') throw new Error('cart line has no quantity')

    return { slug, quantity }
  })
}
