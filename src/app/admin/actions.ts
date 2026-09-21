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
import { advanceOrderStatus } from '@/lib/admin-orders'
import { issueWaybillForOrder } from '@/lib/waybills'
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

async function tooManyAttempts(): Promise<boolean> {
  const list = await headers()
  const key = list.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
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
    redirect(`${ADMIN_LOGIN_PATH}?error=throttled`)
  }

  if (!isCorrectPassword(String(formData.get('password') ?? ''))) {
    redirect(`${ADMIN_LOGIN_PATH}?error=wrong`)
  }

  await startAdminSession()
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
 */
export async function changeStatus(formData: FormData): Promise<void> {
  await requireAdmin()

  const orderId = String(formData.get('orderId') ?? '')
  const to = asStatus(formData.get('to'))
  const expectedFrom = asStatus(formData.get('expectedFrom'))

  if (!orderId || !to) redirect('/admin')

  const result = await advanceOrderStatus({
    orderId,
    to,
    ...(expectedFrom ? { expectedFrom } : {}),
    note: String(formData.get('note') ?? '').slice(0, 500) || undefined,
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
 * Book the parcel at the courier.
 *
 * The one action in the admin that costs money, so it takes no arguments beyond
 * the order: everything about the parcel is read from the stored order, and there
 * is no field on the form an admin could mistype into a wrong address or a wrong
 * amount to collect. Every guard lives in `issueWaybillForOrder`, which is also
 * where the "not twice" invariant is kept.
 */
export async function issueWaybill(formData: FormData): Promise<void> {
  await requireAdmin()

  const orderId = String(formData.get('orderId') ?? '')
  if (!orderId) redirect('/admin')

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

/** A status the enum actually contains, or undefined. Never a cast. */
function asStatus(value: FormDataEntryValue | null): OrderStatus | undefined {
  const text = typeof value === 'string' ? value : ''
  return (orderStatus.enumValues as readonly string[]).includes(text)
    ? (text as OrderStatus)
    : undefined
}
