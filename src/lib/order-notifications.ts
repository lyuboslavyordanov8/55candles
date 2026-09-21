import 'server-only'

import { company, isTodo } from '@/lib/company'
import { isMailerConfigured, orderRecipient, sendEmail, type SendResult } from '@/lib/mailer'
import {
  buildCustomerOrderEmail,
  buildShopOrderEmail,
  type OrderEmailData,
} from '@/lib/order-email'

/**
 * Sending the two order emails (AUDIT.md B-17).
 *
 * The rule this module exists to enforce: **an email never fails an order.** By
 * the time it is called the order is in the database and the customer is about to
 * be shown its number, so a provider outage must not turn a stored order into an
 * error message. Every failure is caught, logged with the order number, and
 * reported back as data.
 *
 * The counterpart rule is that a failure is never silent. An unsent shop
 * notification means a parcel nobody knows to pack, so it is logged at
 * `console.error` with the order number — enough to find the order in the admin
 * and email the customer by hand.
 *
 * Sent inline rather than from a queue. There is no queue, and inventing one here
 * would put orders behind infrastructure that does not exist yet; the timeout in
 * `src/lib/mailer.ts` is what keeps the customer's wait bounded.
 */

export interface OrderNotificationOutcome {
  /** The confirmation to the customer. `skipped` when they left email blank. */
  customer: SendResult | { status: 'skipped' }
  /** The notification to the shop. `skipped` when no recipient is configured. */
  shop: SendResult | { status: 'skipped' }
}

/**
 * Send both emails, whatever happens.
 *
 * Deliberately not `Promise.all`: the shop's copy is the one that gets the parcel
 * packed, so it must be attempted even if the customer's address is rejected by
 * the provider. `sendEmail` already converts a throw into a `failed`, and the
 * `try` here is the backstop for anything the builders could throw on data this
 * module did not anticipate.
 */
export async function sendOrderNotifications(
  data: OrderEmailData
): Promise<OrderNotificationOutcome> {
  if (!isMailerConfigured()) {
    console.error(
      `[orders] Order ${data.orderNumber} was stored but no email provider is ` +
        'configured (AUDIT.md B-17): the customer got no confirmation and the shop ' +
        'got no notification. Set EMAIL_PROVIDER_API_KEY and EMAIL_FROM.'
    )
    return { customer: { status: 'unconfigured' }, shop: { status: 'unconfigured' } }
  }

  const customer = await sendCustomerCopy(data)
  const shop = await sendShopCopy(data)

  return { customer, shop }
}

/**
 * Where a customer's reply to their confirmation lands.
 *
 * The published contact address once it exists — a reply to `contact@…` reaches
 * whoever is on that mailbox today, which is not a fact this code should hard-code
 * — and until then the notification mailboxes, which are read by definition:
 * they are where the order itself was announced. Never the `from` address, which
 * can only send.
 */
function replyMailbox(): readonly string[] {
  const published = company.contact.email
  return isTodo(published) ? orderRecipient() : [published]
}

async function sendCustomerCopy(
  data: OrderEmailData
): Promise<SendResult | { status: 'skipped' }> {
  // The email address is optional at checkout (`delivery-schema.ts`): an order
  // placed by phone-only is a valid order, and there is simply nowhere to write.
  if (!data.delivery.email) return { status: 'skipped' }

  let result: SendResult
  try {
    result = await sendEmail(buildCustomerOrderEmail(data, replyMailbox()))
  } catch (error) {
    result = {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'unknown',
    }
  }

  if (result.status === 'failed') {
    console.error(
      `[orders] Confirmation for ${data.orderNumber} was not delivered: ${result.reason}`
    )
  }

  return result
}

async function sendShopCopy(data: OrderEmailData): Promise<SendResult | { status: 'skipped' }> {
  const to = orderRecipient()

  if (to.length === 0) {
    console.error(
      `[orders] Order ${data.orderNumber} was stored but ORDER_EMAIL_TO (or ` +
        'CONTACT_EMAIL_TO) is unset, so nobody was told about it. It is in the admin.'
    )
    return { status: 'skipped' }
  }

  let result: SendResult
  try {
    result = await sendEmail(buildShopOrderEmail(data, to))
  } catch (error) {
    result = {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'unknown',
    }
  }

  if (result.status !== 'sent') {
    console.error(
      `[orders] Nobody was notified about order ${data.orderNumber}: ` +
        ('reason' in result ? result.reason : result.status)
    )
  }

  return result
}
