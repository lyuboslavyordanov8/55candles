import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { company, isTodo } from '@/lib/company'
import { sendOrderNotifications } from '@/lib/order-notifications'
import { calculateTotal } from '@/lib/order-total'
import type { OrderEmailData } from '@/lib/order-email'
import type { DeliveryDetails } from '@/lib/delivery-schema'

/**
 * Sending the order emails (AUDIT.md B-17).
 *
 * The invariant: **an email never fails an order, and never fails silently.** By
 * the time this runs the order is stored, so every failure has to come back as
 * data and go into the log — never as a throw the checkout action would have to
 * turn into "your order was not taken".
 */

const delivery: DeliveryDetails = {
  recipientName: 'Мария Петрова',
  phone: '+359888123456',
  email: 'maria@example.com',
  courier: 'econt',
  method: 'office',
  city: 'София',
  postCode: '1000',
  street: '',
  officeId: '1234',
  officeName: 'Офис Витоша',
  officeAddress: 'бул. Витоша 1',
  note: '',
}

function data(overrides: Partial<OrderEmailData> = {}): OrderEmailData {
  const total = calculateTotal(
    [{ slug: 'cherry', quantity: 1 }],
    { courier: 'econt', method: 'office' },
    { delivery: { amountMinor: 499, currency: 'EUR' }, codFee: { amountMinor: 0, currency: 'EUR' } }
  )
  if (total.status !== 'ok') throw new Error('fixture is not priced')

  return { orderNumber: '55C-2026-000123', locale: 'bg', delivery, total, ...overrides }
}

function accept() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg_1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
}

describe('sendOrderNotifications', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.EMAIL_PROVIDER_API_KEY = 're_test'
    process.env.EMAIL_FROM = 'orders@example.com'
    process.env.ORDER_EMAIL_TO = 'shop@example.com'
    delete process.env.CONTACT_EMAIL_TO
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends both emails for a normal order', async () => {
    const fetchSpy = accept()

    const result = await sendOrderNotifications(data())

    expect(result.customer.status).toBe('sent')
    expect(result.shop.status).toBe('sent')

    const recipients = fetchSpy.mock.calls.map(
      ([, init]) => JSON.parse(String((init as RequestInit).body)).to[0]
    )
    expect(recipients).toEqual(['maria@example.com', 'shop@example.com'])
  })

  it('lets the customer reply to a mailbox somebody reads', async () => {
    // The published contact address, not the `from` address: `EMAIL_FROM` sends
    // and cannot receive, so a reply to it would be swallowed.
    const fetchSpy = accept()

    await sendOrderNotifications(data())

    const customerCall = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body))
    expect(customerCall.reply_to).toEqual([company.contact.email])
    expect(isTodo(company.contact.email)).toBe(false)
    expect(customerCall.reply_to).not.toContain(process.env.EMAIL_FROM)
  })

  it('announces the order to every shop mailbox', async () => {
    process.env.ORDER_EMAIL_TO = 'one@example.com,two@example.com'
    const fetchSpy = accept()

    const result = await sendOrderNotifications(data())

    expect(result.shop.status).toBe('sent')
    const shopCall = JSON.parse(String((fetchSpy.mock.calls[1]?.[1] as RequestInit).body))
    expect(shopCall.to).toEqual(['one@example.com', 'two@example.com'])
  })

  it('still notifies the shop when the customer left no email address', async () => {
    const fetchSpy = accept()

    const result = await sendOrderNotifications(data({ delivery: { ...delivery, email: '' } }))

    expect(result.customer).toEqual({ status: 'skipped' })
    expect(result.shop.status).toBe('sent')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('still notifies the shop when the customer’s copy is rejected', async () => {
    // The parcel has to get packed even if the confirmation bounced.
    let call = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      call += 1
      return call === 1
        ? new Response('{"message":"invalid recipient"}', { status: 422 })
        : new Response(JSON.stringify({ id: 'msg_2' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
    })

    const result = await sendOrderNotifications(data())

    expect(result.customer.status).toBe('failed')
    expect(result.shop.status).toBe('sent')
  })

  it('logs loudly, and does not throw, when nothing can be sent', async () => {
    delete process.env.EMAIL_PROVIDER_API_KEY
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await sendOrderNotifications(data())

    expect(result).toEqual({
      customer: { status: 'unconfigured' },
      shop: { status: 'unconfigured' },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('55C-2026-000123')
    )
  })

  it('logs when the shop has no recipient configured', async () => {
    delete process.env.ORDER_EMAIL_TO
    accept()

    const result = await sendOrderNotifications(data())

    // The customer is still told; the shop's copy has nowhere to go.
    expect(result.customer.status).toBe('sent')
    expect(result.shop).toEqual({ status: 'skipped' })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('ORDER_EMAIL_TO'))
  })

  it('never throws when the provider is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('socket hang up'))

    const result = await sendOrderNotifications(data())

    expect(result.customer.status).toBe('failed')
    expect(result.shop.status).toBe('failed')
  })
})
