'use server'

import { courierClient } from '@/lib/couriers'
import { validateDelivery, type DeliveryDetails, type FieldErrors } from '@/lib/delivery-schema'
import { calculateTotal, priceCart, type CartLine } from '@/lib/order-total'
import { resolveDeliveryRate } from '@/lib/shipping-rates'
import {
  createOrder,
  INTENT_TOKEN_MAX,
  isOrderStorageReady,
  type PlacedOrder,
} from '@/lib/orders'
import { PAYMENT_METHOD } from '@/lib/payments'
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
 * 3. **The delivery charge is quoted by the courier**, for this parcel, at this
 *    moment (`src/lib/shipping-rates.ts`). If it cannot be, the submission stops
 *    with a "try again" rather than falling back to a made-up figure — an order
 *    stored at an invented price is indistinguishable from a real one.
 *
 * The order *is* persisted now (Q-34, B-01): a valid submission writes it, its
 * lines and its first status event, and the customer is given the order number.
 * Nothing is collected here and nothing ever will be — наложен платеж is the only
 * payment method (`src/lib/payments.ts`), so the courier collects on delivery and
 * `placed` means "we have your order", never "we have your money".
 *
 * Where no database is configured the action still stops at `readyToPay` and says
 * so, rather than pretending an order exists. Same principle as the contact form
 * (B-20): a visible refusal beats a silent lie.
 */

/**
 * The fields whose values are sent back to the form after a submission.
 *
 * Only the ones the customer types. `courier`, `method`, the chosen office and
 * the city/post-code pair live in React state in the form and survive on their
 * own; these are plain uncontrolled inputs, and React clears those when an
 * action completes unless it is handed something to restore them to.
 */
export type EchoedField = 'recipientName' | 'phone' | 'email' | 'street' | 'officeId' | 'note'

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
    /** The order is stored. See `order` for its number. */
    | 'placed'
    /**
     * Everything validated and priced, but nothing stored — reached only where
     * no database is configured. Deliberately not called a success.
     */
    | 'readyToPay'
    | 'invalid'
    /** Prices or courier tariffs are not configured yet (B-03, Q-22). */
    | 'unconfigured'
    | 'error'
  fieldErrors?: FieldErrors
  /**
   * What was submitted, sent straight back so the form can put it in the boxes
   * again. Present on every outcome: one wrong field must not cost the customer
   * the other eight, and after a success the details are what they read back to
   * check the parcel is going where they meant it to.
   */
  values?: Partial<Record<EchoedField, string>>
  /** Human-readable message key, resolved by the client against `checkout`. */
  messageKey?: string
  /** Slugs with no price (B-03), for a specific message. */
  unpriced?: string[]
  /**
   * The stored order, present only with `placed`.
   *
   * The number and nothing else: the row's id and its `public_token` stay on the
   * server until there is a confirmation page to address with them, and a token
   * that is never rendered cannot leak into a screenshot or a browser history.
   */
  order?: { number: string }
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

  // Attached to every return below, including the successful one. Built from the
  // validated values rather than `raw`, so what comes back is trimmed and the
  // phone number is in its canonical form.
  const values = echo(delivery.value)

  if (!delivery.valid) {
    return {
      status: 'invalid',
      values,
      fieldErrors: delivery.errors,
      messageKey: 'fixTheFields',
    }
  }

  // The payment method is not read from the request at all. There is exactly one
  // (наложен платеж), so the server names it; a `paymentMethod` in the payload is
  // ignored rather than validated, because there is no second value it could
  // legitimately ask for and no branch it could reach.
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

  // Two steps because the delivery price now comes from the courier, and the
  // courier needs to know what the parcel weighs. `priceCart` answers that from
  // the catalogue; `calculateTotal` then puts the quoted rate into the total.
  let cart
  try {
    cart = priceCart(lines)
  } catch {
    // CartError — a quantity or slug that could only come from tampering.
    return { status: 'error', values, messageKey: 'cartUnreadable' }
  }

  if (cart.status === 'incomplete') {
    return {
      status: 'unconfigured',
      values,
      unpriced: cart.unpriced,
      messageKey: 'notPricedYet',
    }
  }

  const rate = await resolveDeliveryRate({
    delivery: delivery.value,
    weightGrams: cart.weightGrams,
    goods: cart.goods,
  })

  if (rate.source === 'unavailable') {
    // The courier is the only thing that knows this parcel's price, and it did
    // not answer. Nothing is stored and no total is shown: the alternative is an
    // order priced from the placeholder card, which would look identical to a
    // real one. Logged with the reason in `resolveDeliveryRate`.
    return { status: 'error', values, messageKey: 'deliveryRateUnavailable' }
  }

  let total
  try {
    total = calculateTotal(lines, option, rate.source === 'courier' ? rate.rate : undefined)
  } catch {
    return { status: 'error', values, messageKey: 'cartUnreadable' }
  }

  if (total.status === 'incomplete') {
    // Not an unpriced slug — `priceCart` above has already ruled that out — so
    // it is the delivery: no rate card for this courier and method, or a parcel
    // too heavy for the locker the customer chose.
    return {
      status: 'unconfigured',
      values,
      messageKey: 'deliveryNotPricedYet',
    }
  }

  // Everything below is priced and valid, so these two go on every remaining
  // outcome — including the failures, where the customer should still be able to
  // see what they were about to buy.
  const priced = {
    values,
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

  if (!isOrderStorageReady()) {
    // No DATABASE_URL. Priced, valid, and not taken — said plainly, because the
    // alternative is a customer who believes they have ordered.
    return { status: 'readyToPay', ...priced, messageKey: 'noOrderStorageYet' }
  }

  const intentToken = String(raw.intentToken ?? '').trim()

  if (!intentToken || intentToken.length > INTENT_TOKEN_MAX) {
    // The page mints this token and the form replays it, so an absent one means
    // a form that was rendered before this field existed, or a hand-built POST.
    // Minting one here instead would be worse than refusing: it would remove the
    // double-submit protection precisely for the request that arrived without it.
    return { status: 'error', ...priced, messageKey: 'formOutdated' }
  }

  let placed: PlacedOrder
  try {
    // Written before any payment is initiated — see `src/lib/orders.ts`. The
    // office snapshot passed here is `office.snapshot`, the courier's own record,
    // never the name and address that arrived in the form.
    placed = await createOrder({
      intentToken,
      delivery: delivery.value,
      office: office.snapshot,
      officeVerified: office.verified,
      paymentMethod: PAYMENT_METHOD,
      total,
      rateSource: rate.source,
      ...(rate.source === 'courier' && rate.rate.description
        ? { rateDescription: rate.rate.description }
        : {}),
    })
  } catch (error) {
    // The order was not stored, so nothing may suggest it was. Logged with the
    // intent token so a support request can be matched to this attempt.
    console.error(`[checkout] Could not store the order (intent ${intentToken}):`, error)
    return { status: 'error', ...priced, messageKey: 'orderNotSaved' }
  }

  return {
    status: 'placed',
    ...priced,
    order: { number: placed.orderNumber },
    // Confirmed, and unpaid until the courier collects — the message says both,
    // because "your order is placed" alone would leave the customer unsure whether
    // they still owe anything.
    messageKey: 'orderPlacedCod',
  }
}

/**
 * The values to put back in the form.
 *
 * Empty strings are dropped rather than sent as `''`: an absent key lets the
 * form fall back to its own default, which is what "the customer left this
 * blank" should mean, and it keeps the payload to the fields actually filled in.
 */
function echo(delivery: DeliveryDetails): Partial<Record<EchoedField, string>> {
  const submitted: Record<EchoedField, string> = {
    recipientName: delivery.recipientName,
    phone: delivery.phone,
    email: delivery.email,
    street: delivery.street,
    officeId: delivery.officeId,
    note: delivery.note,
  }

  const values: Partial<Record<EchoedField, string>> = {}
  for (const [field, value] of Object.entries(submitted) as Array<[EchoedField, string]>) {
    if (value) values[field] = value.slice(0, ECHO_MAX)
  }

  return values
}

type OfficeResolution =
  | {
      /** Accepted: confirmed by the courier, taken on trust, or door delivery. */
      status: 'ok'
      snapshot?: { name: string; address: string }
      /**
       * True only when a courier confirmed the code. False when it was accepted
       * because the courier could not be reached or has no credentials — the
       * waybill step has to re-check those, so the distinction is recorded on the
       * order's creation event rather than being thrown away here.
       */
      verified: boolean
    }
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
  // Door delivery has no office to verify; `verified` is false because nothing
  // was, and no waybill step will look for one.
  if (delivery.method === 'door') return { status: 'ok', verified: false }

  const result = await courierClient(delivery.courier).findOffice(delivery.officeId)

  if (result.status === 'unconfigured') {
    // No credentials for this courier, so the customer typed the office into the
    // fallback field. There is nothing to check it against.
    return {
      status: 'ok',
      verified: false,
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
      verified: false,
      snapshot: delivery.officeName
        ? { name: delivery.officeName, address: delivery.officeAddress }
        : undefined,
    }
  }

  if (!result.data) return { status: 'unknown' }

  return {
    status: 'ok',
    verified: true,
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
