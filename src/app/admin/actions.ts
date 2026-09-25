'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import {
  ADMIN_LOGIN_PATH,
  endAdminSession,
  isAdminConfigured,
  isCorrectPassword,
  requireAdmin,
  startAdminSession,
} from '@/lib/admin-auth'
import { advanceOrderStatus, orderNumberOf, revertLastStatusChange } from '@/lib/admin-orders'
import { statusRequiresReason } from '@/lib/order-status'
import { addOrderNote, NOTE_MAX } from '@/lib/order-notes'
import { issueInvoiceForOrder, type InvoiceBuyer } from '@/lib/invoices'
import { cancelWaybillForOrder, issueWaybillForOrder } from '@/lib/waybills'
import { orderStatus, type OrderStatus } from '@/db/schema'

/**
 * Admin actions: log in, log out, move an order along.
 *
 * Each one is its own POST endpoint reachable by anyone who can send the request,
 * so `requireAdmin()` is called *here* and not only in the page that renders the
 * button — the same rule as the checkout action.
 */

/**
 * Brute-force speed bump on the login form.
 *
 * In-process and per-instance, so it resets on deploy: a courtesy limit, not a
 * security control. It is worth having anyway, because the admin is a single
 * shared password and an unthrottled form is a free guessing machine. A real
 * limiter needs shared state.
 */
const WINDOW_MS = 10 * 60_000
const MAX_ATTEMPTS = 10
const attempts = new Map<string, number[]>()

/**
 * Same derivation, and the same caveat, as the checkout's limiter
 * (`checkout/actions.ts`): the first hop of `X-Forwarded-For`, trustworthy
 * only if the deployment's edge overwrites rather than appends to a
 * client-supplied value.
 */
async function clientKey(): Promise<string> {
  const list = await headers()
  return list.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

async function tooManyAttempts(): Promise<boolean> {
  const key = await clientKey()
  const now = Date.now()
  const recent = (attempts.get(key) ?? []).filter((at) => now - at < WINDOW_MS)

  recent.push(now)
  attempts.set(key, recent)

  if (attempts.size > 1000) {
    for (const [k, times] of attempts) {
      if (times.every((at) => now - at >= WINDOW_MS)) attempts.delete(k)
    }
  }

  return recent.length > MAX_ATTEMPTS
}

export async function logIn(formData: FormData): Promise<void> {
  if (!isAdminConfigured()) {
    // No password set means no admin at all — never "everything is open".
    redirect(`${ADMIN_LOGIN_PATH}?error=unconfigured`)
  }

  if (await tooManyAttempts()) {
    // Loud on purpose — see `tooManyAttempts` below for what "loud" means here
    // and why the password itself is never part of it.
    console.error(`[admin] login throttled for ${await clientKey()}`)
    redirect(`${ADMIN_LOGIN_PATH}?error=throttled`)
  }

  if (!isCorrectPassword(String(formData.get('password') ?? ''))) {
    console.error(`[admin] failed login attempt from ${await clientKey()}`)
    redirect(`${ADMIN_LOGIN_PATH}?error=wrong`)
  }

  // Whatever the staff member typed, or nothing — `startAdminSession` falls
  // back to `DEFAULT_ADMIN_NAME` rather than an empty label. Never logged: a
  // name is not a secret, but it also is not this function's business to keep
  // anywhere but the cookie it is about to become part of.
  await startAdminSession(String(formData.get('name') ?? ''))
  redirect('/admin')
}

export async function logOut(): Promise<void> {
  await endAdminSession()
  redirect(ADMIN_LOGIN_PATH)
}

/**
 * Advance one order.
 *
 * `expectedFrom` comes from the page the admin was looking at and is enforced
 * against the database, so a stale tab cannot move an order from a status it has
 * already left. The failure is a redirect back to the order with a message, not an
 * exception: "someone else already packed this" is normal, not broken.
 *
 * Each next-status is its own single-click button on the order page — see
 * `statusRequiresReason` — except `refused_at_delivery` and `returned`, which
 * carry a required reason and so cannot be truly one click. Both post to this
 * same action; the requirement is enforced here, not just with `required` on
 * the input, since a hand-built POST is not bound by the form's attributes.
 */
export async function changeStatus(formData: FormData): Promise<void> {
  const actor = await requireAdmin()

  const orderId = String(formData.get('orderId') ?? '')
  const to = asStatus(formData.get('to'))
  const expectedFrom = asStatus(formData.get('expectedFrom'))

  if (!orderId || !to) redirect('/admin')

  const reason = String(formData.get('reason') ?? '').trim().slice(0, NOTE_MAX)

  if (statusRequiresReason(to) && !reason) {
    redirect(`/admin/orders/${orderId}?error=reason_required`)
  }

  const result = await advanceOrderStatus({
    orderId,
    to,
    actor,
    ...(expectedFrom ? { expectedFrom } : {}),
    ...(reason ? { reason } : {}),
    waybillNumber: String(formData.get('waybillNumber') ?? '').trim() || undefined,
  })

  if (result.status === 'missing') redirect('/admin?error=missing')

  // Both the detail page and the list show the status, so both are stale now.
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin')

  if (result.status === 'notAllowed') {
    redirect(`/admin/orders/${orderId}?error=stale`)
  }

  redirect(`/admin/orders/${orderId}?changed=${to}`)
}

/**
 * Undo the most recent status change, within its window.
 *
 * See `revertLastStatusChange` for what "most recent" and "within its window"
 * mean precisely. This action only translates its outcome into a redirect; all
 * of the actual reasoning lives there, and is tested there.
 */
export async function undoStatusChange(formData: FormData): Promise<void> {
  const actor = await requireAdmin()

  const orderId = String(formData.get('orderId') ?? '')
  if (!orderId) redirect('/admin')

  const result = await revertLastStatusChange(orderId, actor)

  if (result.status === 'missing') redirect('/admin?error=missing')

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin')

  if (result.status !== 'ok') {
    redirect(`/admin/orders/${orderId}?error=undo_${result.status}`)
  }

  redirect(`/admin/orders/${orderId}?reverted=${result.order.status}`)
}

/**
 * Append a free-text note to an order's history without moving it.
 *
 * Distinct from the `note` a status change can carry: this is for the moment
 * nothing about the order changed and there is still something worth writing
 * down — "called twice, no answer" is not a status.
 */
export async function addNote(formData: FormData): Promise<void> {
  const actor = await requireAdmin()

  const orderId = String(formData.get('orderId') ?? '')
  if (!orderId) redirect('/admin')

  const text = String(formData.get('note') ?? '')
  const result = await addOrderNote(orderId, actor, text)

  revalidatePath(`/admin/orders/${orderId}`)

  if (result.status === 'missing') redirect('/admin?error=missing')
  if (result.status === 'empty') redirect(`/admin/orders/${orderId}?error=note_empty`)

  redirect(`/admin/orders/${orderId}?noted=1`)
}

/**
 * Both `issueWaybill` and `issueInvoice` spend something real and cannot be
 * undone by clicking a different button afterwards, so both require typing the
 * order number back — the same type-to-confirm the order page's client-side
 * `ConfirmSubmit` already gates the button on. Checked again here because a
 * disabled button is a UI courtesy, not a boundary: a hand-built POST is bound
 * by nothing the browser enforced.
 */
async function confirmedOrderNumber(orderId: string, formData: FormData): Promise<boolean> {
  const typed = String(formData.get('confirmOrderNumber') ?? '').trim()
  if (!typed) return false

  const actual = await orderNumberOf(orderId)
  return actual !== null && typed === actual
}

/**
 * Book the parcel at the courier.
 *
 * The one action in the admin that costs money, so it takes no arguments beyond
 * the order and the typed confirmation: everything about the parcel is read from
 * the stored order, and there is no field on the form an admin could mistype into
 * a wrong address or a wrong amount to collect. Every other guard lives in
 * `issueWaybillForOrder`, which is also where the "not twice" invariant is kept.
 */
export async function issueWaybill(formData: FormData): Promise<void> {
  await requireAdmin()

  const orderId = String(formData.get('orderId') ?? '')
  if (!orderId) redirect('/admin')

  if (!(await confirmedOrderNumber(orderId, formData))) {
    redirect(`/admin/orders/${orderId}?error=waybill_confirm`)
  }

  const result = await issueWaybillForOrder(orderId)

  if (result.status === 'missing') redirect('/admin?error=missing')

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin')

  if (result.status === 'ok') {
    redirect(`/admin/orders/${orderId}?waybill=${encodeURIComponent(result.waybill.number)}`)
  }

  // The courier's own wording is too long for a query string and too useful to
  // lose, so it is written to the order's history instead and the page points
  // there. See `issueWaybillForOrder`.
  redirect(`/admin/orders/${orderId}?error=waybill_${result.status}`)
}

/**
 * Cancel the order's waybill at the courier — Speedy, before hand-over.
 *
 * Type-to-confirm like the booking, because it cannot be undone either: a
 * cancelled number is gone, and the parcel needs a new one. On success the order
 * can be booked again from the same page.
 */
export async function cancelWaybill(formData: FormData): Promise<void> {
  await requireAdmin()

  const orderId = String(formData.get('orderId') ?? '')
  if (!orderId) redirect('/admin')

  if (!(await confirmedOrderNumber(orderId, formData))) {
    redirect(`/admin/orders/${orderId}?error=cancel_confirm`)
  }

  const result = await cancelWaybillForOrder(orderId)

  if (result.status === 'missing') redirect('/admin?error=missing')

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin')

  if (result.status === 'ok') {
    redirect(`/admin/orders/${orderId}?cancelled=${encodeURIComponent(result.waybillNumber)}`)
  }

  redirect(`/admin/orders/${orderId}?error=cancel_${result.status}`)
}

/**
 * Issue the фактура for an order.
 *
 * Unlike the waybill this one *does* take fields, because the invoice may be made
 * out to a company the checkout never asked about — a customer who wants the
 * candles on their firm's books gives фирма, ЕИК and МОЛ afterwards, by email or
 * on the phone. They default to the person and the address on the order.
 *
 * Irreversible in the way the waybill is not: the number it consumes belongs to a
 * series that may not have gaps, so there is no delete. Everything that could
 * refuse is decided in `issueInvoiceForOrder`.
 */
export async function issueInvoice(formData: FormData): Promise<void> {
  await requireAdmin()

  const orderId = String(formData.get('orderId') ?? '')
  if (!orderId) redirect('/admin')

  if (!(await confirmedOrderNumber(orderId, formData))) {
    redirect(`/admin/orders/${orderId}?error=invoice_confirm`)
  }

  const field = (name: string) => String(formData.get(name) ?? '').trim().slice(0, 200)

  const name = field('buyerName')
  if (!name) redirect(`/admin/orders/${orderId}?error=invoice_buyer`)

  const buyer: InvoiceBuyer = {
    name,
    ...optional('company', field('buyerCompany')),
    ...optional('eik', field('buyerEik')),
    ...optional('vatNumber', field('buyerVatNumber')),
    ...optional('accountable', field('buyerAccountable')),
    ...optional('address', field('buyerAddress')),
  }

  const result = await issueInvoiceForOrder(orderId, buyer)

  if (result.status === 'missing') redirect('/admin?error=missing')

  revalidatePath(`/admin/orders/${orderId}`)

  if (result.status === 'ok') {
    redirect(`/admin/orders/${orderId}?invoice=${encodeURIComponent(result.number)}`)
  }

  redirect(`/admin/orders/${orderId}?error=invoice_${result.status}`)
}

/**
 * An optional field, present only when filled.
 *
 * `{ eik: '' }` and no `eik` at all are different things on a document: the first
 * prints an empty label. See `prunedBuyer` in `src/lib/invoices.ts`, which is the
 * same rule enforced again where the snapshot is built.
 */
function optional<K extends string>(key: K, value: string): Partial<Record<K, string>> {
  return value ? ({ [key]: value } as Record<K, string>) : {}
}

/** A status the enum actually contains, or undefined. Never a cast. */
function asStatus(value: FormDataEntryValue | null): OrderStatus | undefined {
  const text = typeof value === 'string' ? value : ''
  return (orderStatus.enumValues as readonly string[]).includes(text)
    ? (text as OrderStatus)
    : undefined
}
