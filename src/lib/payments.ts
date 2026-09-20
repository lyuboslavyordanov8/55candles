/**
 * How the shop is paid (AUDIT.md Q-20, Q-23, Q-28, B-14).
 *
 * **Наложен платеж — cash on delivery — is the only method.** That is a decision,
 * not a gap: the owner is not taking card payments, there is no Stripe account and
 * no other provider is planned. So nothing here waits on a key, and nothing in the
 * shop may hint at a card option that is not coming.
 *
 * What the decision buys: no card data anywhere near this application, no PCI
 * surface, no provider webhook to trust, no `paid` state that can disagree with
 * the bank. What it costs, and what the fulfilment code must respect: the courier
 * holds the customer's money until it remits, so a delivered order is not a
 * settled one until the remittance is reconciled (`cod_collected` → `reconciled`
 * in `src/db/schema.ts`, AUDIT.md B-14). Courier-collected cash also has its own
 * НАП receipt obligations (Q-28, `[VERIFY WITH ACCOUNTANT]`).
 *
 * Adding a second method later is additive, not a rewrite: append it here, add the
 * value to the `payment_method` enum in `src/db/schema.ts`, and give the checkout
 * back the choice it currently has no reason to render. Every order already records
 * the method it was placed with, so no stored order needs migrating.
 */

export const PAYMENT_METHODS = ['cod'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/**
 * The method every order is placed with.
 *
 * Named once, so the string is not sprinkled through the checkout and the day a
 * second method appears the compiler points at every place that assumed there was
 * only one.
 */
export const PAYMENT_METHOD: PaymentMethod = 'cod'
