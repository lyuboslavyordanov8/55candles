import { company } from '@/lib/company'
import { products } from '@/data/products'
import { formatMoney } from '@/lib/money'
import { defaultLocale, isLocale, type Locale } from '@/i18n/locales'
import type { OrderTotal } from '@/lib/order-total'
import type { DeliveryDetails } from '@/lib/delivery-schema'
import type { OutboundEmail } from '@/lib/mailer'

/**
 * The two emails a placed order produces (AUDIT.md B-17).
 *
 * Pure builders: they take a snapshot and return an `OutboundEmail`. Nothing here
 * reads the database, the network or the request, so both messages can be unit
 * tested for the thing that actually matters about them — that the figures in the
 * email are the figures of the order.
 *
 * ## Why the copy lives here and not in `messages/*.json`
 *
 * Email is not UI. These strings are rendered from a Server Action and, later,
 * from a queue or a cron job where there is no request and therefore no
 * `next-intl` context to ask. A small dictionary keyed by locale keeps the
 * confirmation renderable from anywhere, and keeps the client message catalogue
 * (which ships to the browser) free of text no browser will ever show.
 *
 * ## Two emails, not one with a Bcc
 *
 * The customer's copy and the shop's copy say different things: the customer
 * gets a confirmation and what to prepare for the courier, the shop gets the
 * phone number, the address and the packing list. Bcc-ing the shop on the
 * customer's copy would also mean one provider failure loses both.
 */

/** The `ok` branch of a total — the only one an email can be written from. */
type PricedTotal = Extract<OrderTotal, { status: 'ok' }>

export interface OrderEmailData {
  /** Human-facing reference, e.g. 55C-2026-000123. */
  orderNumber: string
  /** The language the customer checked out in. The shop's copy is always BG. */
  locale: string
  /** Validated and normalised — never raw form input. */
  delivery: DeliveryDetails
  /** The collection point as the courier describes it, where there is one. */
  office?: { name: string; address: string }
  /** Server-computed. Every figure in both emails comes from here. */
  total: PricedTotal
  /**
   * True when the office code was confirmed against the courier. Only the shop's
   * copy mentions it: it is a warning to re-check before printing a waybill, and
   * it would mean nothing to the customer.
   */
  officeVerified?: boolean
}

const copy = {
  bg: {
    subject: (orderNumber: string) => `Поръчка ${orderNumber} е приета — ${company.tradingName}`,
    greeting: (name: string) => `Здравей, ${name},`,
    intro: 'Благодарим за поръчката! Приехме я и вече я подготвяме.',
    orderLine: (orderNumber: string) => `Номер на поръчката: ${orderNumber}`,
    itemsHeading: 'Какво поръча',
    quantity: 'бр.',
    goods: 'Свещи',
    discount: (code: string) => `Отстъпка (${code})`,
    shipping: 'Доставка',
    shippingFree: 'Доставка (безплатна)',
    codFee: 'Такса наложен платеж',
    total: 'Общо за плащане',
    deliveryHeading: 'Доставка',
    courier: 'Куриер',
    toOffice: 'До офис',
    toDoor: 'До адрес',
    recipient: 'Получател',
    phone: 'Телефон',
    note: 'Бележка',
    paymentHeading: 'Плащане',
    paymentBody: (amount: string) =>
      `Плащаш на куриера при получаване (наложен платеж) — ${amount}. ` +
      'Приготви сумата в брой или провери дали куриерът приема карта.',
    nextHeading: 'Какво следва',
    nextBody:
      'Ще получиш съобщение с номера за проследяване, когато пратката тръгне. ' +
      'Ако нещо в поръчката не е както трябва, отговори на този имейл или ни пиши.',
    footerContact: (phone: string) => `Въпроси? Пиши ни или се обади на ${phone}.`,
    signature: `${company.tradingName} · ${company.legalName}, ЕИК ${company.eik}`,
  },
  en: {
    subject: (orderNumber: string) => `Order ${orderNumber} confirmed — ${company.tradingName}`,
    greeting: (name: string) => `Hi ${name},`,
    intro: 'Thank you for your order! We have it, and we are getting it ready.',
    orderLine: (orderNumber: string) => `Order number: ${orderNumber}`,
    itemsHeading: 'What you ordered',
    quantity: '×',
    goods: 'Candles',
    discount: (code: string) => `Discount (${code})`,
    shipping: 'Delivery',
    shippingFree: 'Delivery (free)',
    codFee: 'Cash-on-delivery fee',
    total: 'Total to pay',
    deliveryHeading: 'Delivery',
    courier: 'Courier',
    toOffice: 'To office',
    toDoor: 'To address',
    recipient: 'Recipient',
    phone: 'Phone',
    note: 'Note',
    paymentHeading: 'Payment',
    paymentBody: (amount: string) =>
      `You pay the courier on delivery (cash on delivery) — ${amount}. ` +
      'Please have the amount in cash, or check whether your courier takes a card.',
    nextHeading: 'What happens next',
    nextBody:
      'We will send you the tracking number once the parcel is on its way. ' +
      'If anything about the order is wrong, reply to this email or message us.',
    footerContact: (phone: string) => `Questions? Reply to this email or call ${phone}.`,
    signature: `${company.tradingName} · ${company.legalName}, EIK ${company.eik}`,
  },
} as const

/** Courier names as they are written on a waybill, in both languages. */
const courierName = { econt: 'Econt', speedy: 'Speedy' } as const

function dictionary(locale: string) {
  return copy[isLocale(locale) ? (locale as Locale) : defaultLocale]
}

/** The catalogue's own product name, or the slug if the product is gone. */
function productName(slug: string): string {
  return products.find((product) => product.slug === slug)?.name ?? slug
}

/** `Name × 2 — 39,98 €`, the one line shape both emails use for an item. */
function itemLine(
  line: PricedTotal['lines'][number],
  locale: string,
  quantityLabel: string
): string {
  return `${productName(line.slug)} — ${line.quantity} ${quantityLabel} × ${formatMoney(
    line.unitPrice,
    locale
  )} = ${formatMoney(line.lineTotal, locale)}`
}

/**
 * Where the parcel is going, as one human-readable line.
 *
 * Shared by both emails so the customer and the packer are reading the same
 * description of the same destination.
 */
export function formatDestination(data: OrderEmailData, locale: string): string {
  const t = dictionary(locale)
  const { delivery } = data
  const place = [delivery.postCode, delivery.city].filter(Boolean).join(' ')

  if (delivery.method === 'door') {
    return `${t.toDoor}: ${[delivery.street, place].filter(Boolean).join(', ')}`
  }

  // The courier's own record where there is one, the picker's copy otherwise, and
  // the bare code as a last resort — never nothing, because "to office" with no
  // office is unactionable for the customer and for whoever packs the parcel.
  const office = data.office ?? {
    name: delivery.officeName,
    address: delivery.officeAddress,
  }

  const described = [office.name, office.address].filter(Boolean).join(', ')

  return `${t.toOffice}: ${described || delivery.officeId} (${delivery.officeId}${
    place ? `, ${place}` : ''
  })`
}

/** The money lines of the order, in the order an invoice would show them. */
function totalLines(data: OrderEmailData, locale: string): Array<[string, string]> {
  const t = dictionary(locale)
  const { total } = data
  const rows: Array<[string, string]> = [[t.goods, formatMoney(total.goods, locale)]]

  if (total.discount && total.promoCode) {
    // Negative, so the customer can add the column up and reach the total.
    rows.push([
      t.discount(total.promoCode),
      `−${formatMoney(total.discount, locale)}`,
    ])
  }

  rows.push([
    total.freeShipping ? t.shippingFree : t.shipping,
    formatMoney(total.shipping, locale),
  ])

  if (total.codFee) {
    rows.push([t.codFee, formatMoney(total.codFee, locale)])
  }

  rows.push([t.total, formatMoney(total.total, locale)])

  return rows
}

/**
 * The customer's confirmation.
 *
 * `replyTo` is passed in rather than assumed, because `EMAIL_FROM` is a
 * **send-only** address: the domain has no inbox, so a customer hitting Reply on
 * this email would be writing to nobody. The email tells them they can reply, so
 * that has to be true — the caller supplies the mailbox that is actually read.
 */
export function buildCustomerOrderEmail(
  data: OrderEmailData,
  replyTo?: string | readonly string[]
): OutboundEmail {
  const locale = isLocale(data.locale) ? data.locale : defaultLocale
  const t = dictionary(locale)
  const items = data.total.lines.map((line) => itemLine(line, locale, t.quantity))
  const totals = totalLines(data, locale)

  const text = [
    t.greeting(data.delivery.recipientName),
    '',
    t.intro,
    t.orderLine(data.orderNumber),
    '',
    `${t.itemsHeading}:`,
    ...items.map((line) => `  • ${line}`),
    '',
    ...totals.map(([label, value]) => `  ${label}: ${value}`),
    '',
    `${t.deliveryHeading}:`,
    `  ${t.courier}: ${courierName[data.delivery.courier]}`,
    `  ${formatDestination(data, locale)}`,
    `  ${t.recipient}: ${data.delivery.recipientName}, ${data.delivery.phone}`,
    ...(data.delivery.note ? [`  ${t.note}: ${data.delivery.note}`] : []),
    '',
    `${t.paymentHeading}: ${t.paymentBody(formatMoney(data.total.total, locale))}`,
    '',
    `${t.nextHeading}: ${t.nextBody}`,
    '',
    t.footerContact(company.contact.phoneDisplay),
    t.signature,
  ].join('\n')

  return {
    to: data.delivery.email,
    subject: t.subject(data.orderNumber),
    text,
    html: customerHtml(data, locale, items, totals),
    ...(replyTo?.length ? { replyTo } : {}),
  }
}

/**
 * The shop's copy: everything needed to pack and ship without opening the admin.
 *
 * Always Bulgarian, whatever the customer browsed in — it is read by the shop,
 * not by the customer. `replyTo` is the customer, so answering the notification
 * reaches them directly.
 */
export function buildShopOrderEmail(
  data: OrderEmailData,
  to: string | readonly string[]
): OutboundEmail {
  const locale = defaultLocale
  const t = dictionary(locale)
  const { delivery, total } = data

  const text = [
    `Нова поръчка ${data.orderNumber}`,
    '',
    'Стоки:',
    ...total.lines.map((line) => `  • ${itemLine(line, locale, t.quantity)}`),
    '',
    ...totalLines(data, locale).map(([label, value]) => `  ${label}: ${value}`),
    `  Тегло: ${total.weightGrams} г`,
    '',
    'Доставка:',
    `  Куриер: ${courierName[delivery.courier]}`,
    `  ${formatDestination(data, locale)}`,
    ...(delivery.method !== 'door' && data.officeVerified === false
      ? ['  ⚠ Офисът НЕ е потвърден от куриера — провери кода преди товарителницата.']
      : []),
    '',
    'Клиент:',
    `  ${delivery.recipientName}`,
    `  ${delivery.phone}`,
    `  ${delivery.email || '(без имейл)'}`,
    ...(delivery.note ? [`  Бележка: ${delivery.note}`] : []),
    '',
    'Плащане: наложен платеж — куриерът събира ' + formatMoney(total.total, locale),
  ].join('\n')

  return {
    to,
    // The number first, so a mailbox sorted by subject sorts by order.
    subject: `Нова поръчка ${data.orderNumber} — ${formatMoney(total.total, locale)}`,
    // So a reply from the shop lands with the customer rather than with itself.
    ...(delivery.email ? { replyTo: delivery.email } : {}),
    text,
  }
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/**
 * Escape for interpolation into the HTML part.
 *
 * Every value below is customer-supplied or catalogue-supplied, and an order note
 * containing `<` must not be able to alter the message. Not React, so nothing
 * escapes for us here.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Inline styles and a single table, deliberately.
 *
 * Email clients strip `<style>` blocks and know nothing of flexbox or custom
 * properties, so this is plain HTML with inline attributes — the brand's warmth
 * carried by two colours rather than by a layout that Outlook would discard.
 */
function customerHtml(
  data: OrderEmailData,
  locale: Locale,
  items: readonly string[],
  totals: ReadonlyArray<readonly [string, string]>
): string {
  const t = dictionary(locale)
  const ink = '#2b2118'
  const muted = '#6b5f52'

  const row = (label: string, value: string, strong = false) =>
    `<tr>` +
    `<td style="padding:6px 0;color:${strong ? ink : muted};font-size:14px;">${
      strong ? `<strong>${escapeHtml(label)}</strong>` : escapeHtml(label)
    }</td>` +
    `<td style="padding:6px 0;text-align:right;color:${ink};font-size:14px;white-space:nowrap;">${
      strong ? `<strong>${escapeHtml(value)}</strong>` : escapeHtml(value)
    }</td>` +
    `</tr>`

  const totalRows = totals
    .map(([label, value], index) => row(label, value, index === totals.length - 1))
    .join('')

  return `<!doctype html>
<html lang="${locale}"><body style="margin:0;padding:24px;background:#faf6f1;font-family:Georgia,'Times New Roman',serif;color:${ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffdfa;border-radius:12px;padding:28px;">
<tr><td>
<p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${muted};">${escapeHtml(
    company.tradingName
  )}</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:normal;">${escapeHtml(
    t.subject(data.orderNumber).split('—')[0].trim()
  )}</h1>
<p style="margin:0 0 8px;font-size:15px;">${escapeHtml(t.greeting(data.delivery.recipientName))}</p>
<p style="margin:0 0 20px;font-size:15px;">${escapeHtml(t.intro)}</p>

<h2 style="margin:24px 0 8px;font-size:15px;">${escapeHtml(t.itemsHeading)}</h2>
<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.7;">
${items.map((line) => `<li>${escapeHtml(line)}</li>`).join('\n')}
</ul>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;border-top:1px solid #e8ded2;">
${totalRows}
</table>

<h2 style="margin:24px 0 8px;font-size:15px;">${escapeHtml(t.deliveryHeading)}</h2>
<p style="margin:0;font-size:14px;line-height:1.7;">
${escapeHtml(`${t.courier}: ${courierName[data.delivery.courier]}`)}<br>
${escapeHtml(formatDestination(data, locale))}<br>
${escapeHtml(`${t.recipient}: ${data.delivery.recipientName}, ${data.delivery.phone}`)}
${data.delivery.note ? `<br>${escapeHtml(`${t.note}: ${data.delivery.note}`)}` : ''}
</p>

<h2 style="margin:24px 0 8px;font-size:15px;">${escapeHtml(t.paymentHeading)}</h2>
<p style="margin:0;font-size:14px;line-height:1.7;">${escapeHtml(
    t.paymentBody(formatMoney(data.total.total, locale))
  )}</p>

<h2 style="margin:24px 0 8px;font-size:15px;">${escapeHtml(t.nextHeading)}</h2>
<p style="margin:0;font-size:14px;line-height:1.7;">${escapeHtml(t.nextBody)}</p>

<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e8ded2;font-size:13px;color:${muted};">
${escapeHtml(t.footerContact(company.contact.phoneDisplay))}<br>
${escapeHtml(t.signature)}
</p>
</td></tr></table>
</body></html>`
}
