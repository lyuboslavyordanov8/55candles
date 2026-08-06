import { CURRENCY, type Money } from './money'

/**
 * Payment methods (AUDIT.md Q-20, Q-21, Q-23, B-12).
 *
 * The owner chose Stripe for cards plus наложен платеж (cash on delivery).
 * Both are modelled here behind one interface so the checkout does not branch
 * on provider; only `initiate()` differs.
 *
 * Stripe is **not** wired up: it needs an account, keys, a webhook secret, and
 * a decision on the statement descriptor (Q-26). What exists is the contract
 * and an honest `unconfigured` result. Critically, no card data ever touches
 * this application — Stripe Checkout or Payment Elements keeps the PCI surface
 * on Stripe's side, and adding it will require the CSP changes already flagged
 * in `next.config.ts`.
 *
 * COD needs no provider, but it is not free of obligations: НАП receipt rules
 * differ for courier-collected cash (Q-28, `[VERIFY WITH ACCOUNTANT]`).
 */

export const PAYMENT_METHODS = ['card', 'cod'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export interface PaymentIntent {
  method: PaymentMethod
  amount: Money
  /** Our order reference, shown to the customer and on the courier label. */
  orderReference: string
}

export type PaymentResult =
  /** Card: send the customer to the provider to complete payment. */
  | { status: 'redirect'; url: string }
  /** COD: nothing to collect now; the courier collects on delivery. */
  | { status: 'deferred'; collectOnDelivery: Money }
  | { status: 'unconfigured'; method: PaymentMethod; missing: string[] }
  | { status: 'failed'; reason: string }

const STRIPE_VARS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const

export function isStripeConfigured(): boolean {
  return STRIPE_VARS.every((name) => Boolean(process.env[name]))
}

export function missingStripeVars(): string[] {
  return STRIPE_VARS.filter((name) => !process.env[name])
}

/**
 * Whether a method can be offered at checkout.
 *
 * COD is always available — it needs no provider. Cards require Stripe keys,
 * so the card option is hidden rather than shown-and-broken.
 */
export function isPaymentMethodAvailable(method: PaymentMethod): boolean {
  return method === 'cod' ? true : isStripeConfigured()
}

export function availablePaymentMethods(): PaymentMethod[] {
  return PAYMENT_METHODS.filter(isPaymentMethodAvailable)
}

export class PaymentError extends Error {}

/**
 * Begin payment.
 *
 * Amount validation happens here rather than at the call site because this is
 * the last point before money is involved: a zero or negative charge means the
 * cart arithmetic upstream is wrong, and creating the intent anyway would turn
 * a caught bug into a free order.
 */
export async function initiate(intent: PaymentIntent): Promise<PaymentResult> {
  if (intent.amount.amountMinor <= 0) {
    throw new PaymentError(
      `Refusing to charge ${intent.amount.amountMinor} minor units for ${intent.orderReference}`
    )
  }

  if (intent.amount.currency !== CURRENCY) {
    throw new PaymentError(`Unsupported currency ${intent.amount.currency}`)
  }

  if (intent.method === 'cod') {
    return { status: 'deferred', collectOnDelivery: intent.amount }
  }

  if (!isStripeConfigured()) {
    return { status: 'unconfigured', method: 'card', missing: missingStripeVars() }
  }

  // [TODO: Q-20 — create a Stripe Checkout Session and return its URL.]
  //
  // When implementing: pass `amount.amountMinor` directly (Stripe also works
  // in minor units, so no conversion and no rounding), set the currency to
  // lowercase 'eur', put `orderReference` in `client_reference_id`, and treat
  // the `checkout.session.completed` **webhook** as the only proof of payment.
  // A customer landing on the success URL is not payment; they can navigate
  // there directly.
  throw new PaymentError('Stripe integration not implemented — see AUDIT.md Q-20')
}

/**
 * Statement descriptor (Q-26): what appears on the customer's card statement.
 *
 * Unset on purpose. An unrecognisable descriptor is a leading cause of
 * chargebacks, and it should read as the *brand the customer bought from*.
 * Stripe caps it at 22 characters.
 */
export const STATEMENT_DESCRIPTOR: string | null = null
