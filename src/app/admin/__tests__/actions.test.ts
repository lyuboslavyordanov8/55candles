import { describe, it, expect, beforeEach, vi } from 'vitest'
import { headers } from 'next/headers'

import {
  addNote,
  changeStatus,
  issueInvoice,
  issueWaybill,
  logIn,
  undoStatusChange,
} from '../actions'
import { isAdminConfigured, isCorrectPassword, requireAdmin, startAdminSession } from '@/lib/admin-auth'
import { advanceOrderStatus, orderNumberOf, revertLastStatusChange } from '@/lib/admin-orders'
import { addOrderNote } from '@/lib/order-notes'
import { issueWaybillForOrder } from '@/lib/waybills'
import { issueInvoiceForOrder } from '@/lib/invoices'

/**
 * The admin Server Actions, minus everything below them (AUDIT.md order-
 * management back office).
 *
 * Every module these actions call is mocked — `advanceOrderStatus`,
 * `revertLastStatusChange`, `addOrderNote`, `issueWaybillForOrder` and
 * `issueInvoiceForOrder` all write to the database, and the same convention as
 * `checkout/__tests__/persistence.test.ts` applies: what is tested here is
 * *what the action asks for*, not what Postgres does with it.
 *
 * `next/navigation`'s `redirect()` throws in real Next.js, ending the function;
 * the mock below reproduces exactly that so control flow after a redirect
 * behaves the same way here as in production, and so the destination can be
 * asserted on.
 */

class RedirectSignal extends Error {
  constructor(public path: string) {
    super('REDIRECT')
  }
}

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new RedirectSignal(path)
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/headers', () => ({ headers: vi.fn() }))

vi.mock('@/lib/admin-auth', () => ({
  ADMIN_LOGIN_PATH: '/admin/login',
  isAdminConfigured: vi.fn(() => true),
  isCorrectPassword: vi.fn(() => false),
  requireAdmin: vi.fn(async () => 'Мария'),
  startAdminSession: vi.fn(async () => undefined),
  endAdminSession: vi.fn(async () => undefined),
}))

vi.mock('@/lib/admin-orders', () => ({
  advanceOrderStatus: vi.fn(),
  revertLastStatusChange: vi.fn(),
  orderNumberOf: vi.fn(),
}))

vi.mock('@/lib/order-notes', () => ({
  addOrderNote: vi.fn(),
  NOTE_MAX: 500,
}))

vi.mock('@/lib/waybills', () => ({
  issueWaybillForOrder: vi.fn(),
}))

vi.mock('@/lib/invoices', () => ({
  issueInvoiceForOrder: vi.fn(),
}))

/** Runs an action and returns where it redirected to, or throws if it did not. */
async function redirectedTo(run: () => Promise<void>): Promise<string> {
  try {
    await run()
  } catch (error) {
    if (error instanceof RedirectSignal) return error.path
    throw error
  }
  throw new Error('expected the action to redirect, and it did not')
}

function formData(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

const ORDER_ID = 'order-1'

beforeEach(() => {
  vi.mocked(headers).mockResolvedValue(new Headers({ 'x-forwarded-for': '10.0.0.1' }) as never)
  vi.mocked(requireAdmin).mockResolvedValue('Мария')
  // Failed logins log on purpose (security review: "log failed attempts") —
  // silenced here so the suite's output is not a wall of expected noise, and
  // asserted on explicitly below where that is the point of the test.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('logIn', () => {
  it('redirects to the unconfigured error when no password is set', async () => {
    vi.mocked(isAdminConfigured).mockReturnValueOnce(false)

    const path = await redirectedTo(() => logIn(formData({ password: 'anything' })))

    expect(path).toBe('/admin/login?error=unconfigured')
  })

  it('redirects to the wrong-password error and does not start a session', async () => {
    vi.mocked(isCorrectPassword).mockReturnValueOnce(false)

    const path = await redirectedTo(() => logIn(formData({ password: 'wrong', name: 'Мария' })))

    expect(path).toBe('/admin/login?error=wrong')
    expect(startAdminSession).not.toHaveBeenCalled()
  })

  it('logs a failed attempt, but never the password itself', async () => {
    vi.mocked(isCorrectPassword).mockReturnValueOnce(false)

    await redirectedTo(() => logIn(formData({ password: 'the-actual-secret' })))

    expect(console.error).toHaveBeenCalledTimes(1)
    const [logged] = vi.mocked(console.error).mock.calls[0]
    expect(logged).not.toContain('the-actual-secret')
    expect(logged).toContain('10.0.0.1')
  })

  it('starts a session with the typed name and lands on /admin', async () => {
    vi.mocked(isCorrectPassword).mockReturnValueOnce(true)

    const path = await redirectedTo(() => logIn(formData({ password: 'correct', name: 'Иван' })))

    expect(startAdminSession).toHaveBeenCalledWith('Иван')
    expect(path).toBe('/admin')
  })

  it('throttles after enough failed attempts from the same address', async () => {
    vi.mocked(isCorrectPassword).mockReturnValue(false)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await redirectedTo(() => logIn(formData({ password: 'wrong' })))
    }

    const path = await redirectedTo(() => logIn(formData({ password: 'wrong' })))

    expect(path).toBe('/admin/login?error=throttled')
  })

  it('does not throttle a different address sharing the same window', async () => {
    vi.mocked(isCorrectPassword).mockReturnValue(false)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await redirectedTo(() => logIn(formData({ password: 'wrong' })))
    }

    vi.mocked(headers).mockResolvedValue(new Headers({ 'x-forwarded-for': '10.0.0.2' }) as never)
    const path = await redirectedTo(() => logIn(formData({ password: 'wrong' })))

    expect(path).toBe('/admin/login?error=wrong')
  })
})

describe('changeStatus', () => {
  it('redirects to /admin when orderId or to is missing', async () => {
    expect(await redirectedTo(() => changeStatus(formData({ to: 'packed' })))).toBe('/admin')
    expect(await redirectedTo(() => changeStatus(formData({ orderId: ORDER_ID })))).toBe('/admin')
  })

  it('requires a reason for refused_at_delivery, and never calls advanceOrderStatus without one', async () => {
    const path = await redirectedTo(() =>
      changeStatus(formData({ orderId: ORDER_ID, to: 'refused_at_delivery' }))
    )

    expect(path).toBe(`/admin/orders/${ORDER_ID}?error=reason_required`)
    expect(advanceOrderStatus).not.toHaveBeenCalled()
  })

  it('accepts refused_at_delivery once a reason is given, and passes it through', async () => {
    vi.mocked(advanceOrderStatus).mockResolvedValueOnce({
      status: 'ok',
      order: { orderNumber: '55C-2026-000123', status: 'refused_at_delivery' },
    })

    await changeStatus(
      formData({ orderId: ORDER_ID, to: 'refused_at_delivery', reason: 'not home' })
    ).catch(() => {})

    expect(advanceOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID, to: 'refused_at_delivery', reason: 'not home' })
    )
  })

  it('threads the session name through as the actor, never a hardcoded value', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce('Петър')
    vi.mocked(advanceOrderStatus).mockResolvedValueOnce({
      status: 'ok',
      order: { orderNumber: '55C-2026-000123', status: 'packed' },
    })

    await changeStatus(formData({ orderId: ORDER_ID, to: 'packed' })).catch(() => {})

    expect(advanceOrderStatus).toHaveBeenCalledWith(expect.objectContaining({ actor: 'Петър' }))
  })

  it('redirects to /admin when the order is missing', async () => {
    vi.mocked(advanceOrderStatus).mockResolvedValueOnce({ status: 'missing' })

    const path = await redirectedTo(() => changeStatus(formData({ orderId: ORDER_ID, to: 'packed' })))

    expect(path).toBe('/admin?error=missing')
  })

  it('redirects with a stale-order message when the transition is not allowed', async () => {
    vi.mocked(advanceOrderStatus).mockResolvedValueOnce({ status: 'notAllowed', from: 'shipped' })

    const path = await redirectedTo(() => changeStatus(formData({ orderId: ORDER_ID, to: 'packed' })))

    expect(path).toBe(`/admin/orders/${ORDER_ID}?error=stale`)
  })

  it('redirects to the order with the new status on success', async () => {
    vi.mocked(advanceOrderStatus).mockResolvedValueOnce({
      status: 'ok',
      order: { orderNumber: '55C-2026-000123', status: 'packed' },
    })

    const path = await redirectedTo(() => changeStatus(formData({ orderId: ORDER_ID, to: 'packed' })))

    expect(path).toBe(`/admin/orders/${ORDER_ID}?changed=packed`)
  })
})

describe('undoStatusChange', () => {
  it('redirects to /admin when orderId is missing', async () => {
    expect(await redirectedTo(() => undoStatusChange(formData({})))).toBe('/admin')
  })

  it('passes the session name as the actor', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce('Петър')
    vi.mocked(revertLastStatusChange).mockResolvedValueOnce({
      status: 'ok',
      order: { orderNumber: '55C-2026-000123', status: 'awaiting_cod' },
    })

    await undoStatusChange(formData({ orderId: ORDER_ID })).catch(() => {})

    expect(revertLastStatusChange).toHaveBeenCalledWith(ORDER_ID, 'Петър')
  })

  it('redirects to /admin when the order is missing', async () => {
    vi.mocked(revertLastStatusChange).mockResolvedValueOnce({ status: 'missing' })

    const path = await redirectedTo(() => undoStatusChange(formData({ orderId: ORDER_ID })))

    expect(path).toBe('/admin?error=missing')
  })

  it('names the failure reason in the redirect when it cannot undo', async () => {
    vi.mocked(revertLastStatusChange).mockResolvedValueOnce({ status: 'tooLate' })

    const path = await redirectedTo(() => undoStatusChange(formData({ orderId: ORDER_ID })))

    expect(path).toBe(`/admin/orders/${ORDER_ID}?error=undo_tooLate`)
  })

  it('redirects with the reverted-to status on success', async () => {
    vi.mocked(revertLastStatusChange).mockResolvedValueOnce({
      status: 'ok',
      order: { orderNumber: '55C-2026-000123', status: 'awaiting_cod' },
    })

    const path = await redirectedTo(() => undoStatusChange(formData({ orderId: ORDER_ID })))

    expect(path).toBe(`/admin/orders/${ORDER_ID}?reverted=awaiting_cod`)
  })
})

describe('addNote', () => {
  it('redirects to /admin when orderId is missing', async () => {
    expect(await redirectedTo(() => addNote(formData({ note: 'hello' })))).toBe('/admin')
  })

  it('passes the session name and the typed text through', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce('Петър')
    vi.mocked(addOrderNote).mockResolvedValueOnce({ status: 'ok' })

    await addNote(formData({ orderId: ORDER_ID, note: 'called twice, no answer' })).catch(() => {})

    expect(addOrderNote).toHaveBeenCalledWith(ORDER_ID, 'Петър', 'called twice, no answer')
  })

  it('redirects with an error for an empty note, rather than writing one', async () => {
    vi.mocked(addOrderNote).mockResolvedValueOnce({ status: 'empty' })

    const path = await redirectedTo(() => addNote(formData({ orderId: ORDER_ID, note: '   ' })))

    expect(path).toBe(`/admin/orders/${ORDER_ID}?error=note_empty`)
  })

  it('redirects to the order with confirmation on success', async () => {
    vi.mocked(addOrderNote).mockResolvedValueOnce({ status: 'ok' })

    const path = await redirectedTo(() => addNote(formData({ orderId: ORDER_ID, note: 'ok' })))

    expect(path).toBe(`/admin/orders/${ORDER_ID}?noted=1`)
  })
})

describe('issueWaybill: type-to-confirm', () => {
  it('refuses, and never calls the courier, when the typed order number does not match', async () => {
    vi.mocked(orderNumberOf).mockResolvedValueOnce('55C-2026-000123')

    const path = await redirectedTo(() =>
      issueWaybill(formData({ orderId: ORDER_ID, confirmOrderNumber: '55C-2026-000999' }))
    )

    expect(path).toBe(`/admin/orders/${ORDER_ID}?error=waybill_confirm`)
    expect(issueWaybillForOrder).not.toHaveBeenCalled()
  })

  it('refuses when nothing was typed at all', async () => {
    vi.mocked(orderNumberOf).mockResolvedValueOnce('55C-2026-000123')

    const path = await redirectedTo(() => issueWaybill(formData({ orderId: ORDER_ID })))

    expect(path).toBe(`/admin/orders/${ORDER_ID}?error=waybill_confirm`)
    expect(issueWaybillForOrder).not.toHaveBeenCalled()
  })

  it('proceeds once the typed number matches, and reports the booked number', async () => {
    vi.mocked(orderNumberOf).mockResolvedValueOnce('55C-2026-000123')
    vi.mocked(issueWaybillForOrder).mockResolvedValueOnce({
      status: 'ok',
      waybill: { number: 'BG123456789', trackingUrl: 'https://example.com/track/BG123456789' },
    })

    const path = await redirectedTo(() =>
      issueWaybill(formData({ orderId: ORDER_ID, confirmOrderNumber: '55C-2026-000123' }))
    )

    expect(issueWaybillForOrder).toHaveBeenCalledWith(ORDER_ID)
    expect(path).toBe(`/admin/orders/${ORDER_ID}?waybill=BG123456789`)
  })
})

describe('issueInvoice: type-to-confirm', () => {
  it('refuses, and never issues an invoice, when the typed order number does not match', async () => {
    vi.mocked(orderNumberOf).mockResolvedValueOnce('55C-2026-000123')

    const path = await redirectedTo(() =>
      issueInvoice(
        formData({
          orderId: ORDER_ID,
          confirmOrderNumber: 'wrong',
          buyerName: 'Мария Иванова',
        })
      )
    )

    expect(path).toBe(`/admin/orders/${ORDER_ID}?error=invoice_confirm`)
    expect(issueInvoiceForOrder).not.toHaveBeenCalled()
  })

  it('still requires a buyer name once the confirmation matches', async () => {
    vi.mocked(orderNumberOf).mockResolvedValueOnce('55C-2026-000123')

    const path = await redirectedTo(() =>
      issueInvoice(formData({ orderId: ORDER_ID, confirmOrderNumber: '55C-2026-000123' }))
    )

    expect(path).toBe(`/admin/orders/${ORDER_ID}?error=invoice_buyer`)
    expect(issueInvoiceForOrder).not.toHaveBeenCalled()
  })

  it('proceeds once confirmed and a buyer name is given', async () => {
    vi.mocked(orderNumberOf).mockResolvedValueOnce('55C-2026-000123')
    vi.mocked(issueInvoiceForOrder).mockResolvedValueOnce({
      status: 'ok',
      number: '0000000042',
      issuedAt: new Date('2026-09-21T10:00:00Z'),
    })

    const path = await redirectedTo(() =>
      issueInvoice(
        formData({
          orderId: ORDER_ID,
          confirmOrderNumber: '55C-2026-000123',
          buyerName: 'Мария Иванова',
        })
      )
    )

    expect(issueInvoiceForOrder).toHaveBeenCalledWith(
      ORDER_ID,
      expect.objectContaining({ name: 'Мария Иванова' })
    )
    expect(path).toBe(`/admin/orders/${ORDER_ID}?invoice=0000000042`)
  })
})
