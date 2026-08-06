'use server'

import { validateDelivery, type FieldErrors } from '@/lib/delivery-schema'
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
  /** Human-readable message key, resolved by the client against `checkout`. */
  messageKey?: string
  /** Slugs with no price (B-03), for a specific message. */
  unpriced?: string[]
  summary?: {
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

  if (!delivery.valid || !isKnownMethod) {
    return {
      status: 'invalid',
      fieldErrors: delivery.errors,
      messageKey: isKnownMethod ? 'fixTheFields' : 'choosePayment',
    }
  }

  if (!availablePaymentMethods().includes(paymentMethod as PaymentMethod)) {
    // Card was submitted but Stripe is not configured. Reachable only by a
    // direct POST, since the UI hides unavailable methods.
    return { status: 'unconfigured', messageKey: 'paymentUnavailable' }
  }

  let lines: CartLine[]
  try {
    lines = parseCart(raw.cart)
  } catch {
    return { status: 'error', messageKey: 'cartUnreadable' }
  }

  if (lines.length === 0) {
    return { status: 'invalid', messageKey: 'cartEmpty' }
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
    return { status: 'error', messageKey: 'cartUnreadable' }
  }

  if (total.status === 'incomplete') {
    return {
      status: 'unconfigured',
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
  return {
    status: 'readyToPay',
    messageKey: 'noOrderStorageYet',
    summary: {
      goodsMinor: total.goods.amountMinor,
      shippingMinor: total.shipping.amountMinor,
      codFeeMinor: total.codFee?.amountMinor ?? null,
      totalMinor: total.total.amountMinor,
      weightGrams: total.weightGrams,
    },
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
