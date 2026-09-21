import { describe, it, expect } from 'vitest'

import {
  buildCustomerOrderEmail,
  buildShopOrderEmail,
  type OrderEmailData,
} from '@/lib/order-email'
import { calculateTotal } from '@/lib/order-total'
import type { DeliveryDetails } from '@/lib/delivery-schema'
import { products } from '@/data/products'

/**
 * The two order emails (AUDIT.md B-17).
 *
 * What is asserted is the thing a customer would complain about: the figures in
 * the email are the figures of the order, the destination is the destination, and
 * the shop's copy carries what is needed to pack the parcel. The wording is not
 * asserted line by line — that would fail on every edit and prove nothing.
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
    [{ slug: 'cherry', quantity: 2 }],
    { courier: 'econt', method: 'office' },
    { delivery: { amountMinor: 499, currency: 'EUR' }, codFee: { amountMinor: 0, currency: 'EUR' } }
  )

  if (total.status !== 'ok') throw new Error('fixture is not priced')

  return {
    orderNumber: '55C-2026-000123',
    locale: 'bg',
    delivery,
    office: { name: 'Офис Витоша', address: 'бул. Витоша 1' },
    total,
    officeVerified: true,
    ...overrides,
  }
}

const cherry = products.find((product) => product.slug === 'cherry')!

describe('buildCustomerOrderEmail', () => {
  it('addresses the customer and names the order', () => {
    const email = buildCustomerOrderEmail(data())

    expect(email.to).toBe('maria@example.com')
    expect(email.subject).toContain('55C-2026-000123')
    expect(email.text).toContain('55C-2026-000123')
    expect(email.text).toContain('Мария Петрова')
  })

  it('itemises what was ordered, with the quantity and the line total', () => {
    const email = buildCustomerOrderEmail(data())

    expect(email.text).toContain(cherry.name)
    expect(email.text).toContain('2')
    // 2 × 19,99 €
    expect(email.text).toContain('39,98')
  })

  it('shows the delivery charge and the total the courier will collect', () => {
    const email = buildCustomerOrderEmail(data())

    expect(email.text).toContain('4,99')
    // 39,98 + 4,99
    expect(email.text).toContain('44,97')
    expect(email.text).toContain('наложен платеж')
  })

  it('names the collection point the courier confirmed', () => {
    const email = buildCustomerOrderEmail(data())

    expect(email.text).toContain('Офис Витоша')
    expect(email.text).toContain('1234')
  })

  it('gives the street address for a door delivery instead of an office', () => {
    const email = buildCustomerOrderEmail(
      data({
        delivery: { ...delivery, method: 'door', street: 'ул. Иван Вазов 5', officeId: '' },
        office: undefined,
      })
    )

    expect(email.text).toContain('ул. Иван Вазов 5')
    expect(email.text).not.toContain('Офис Витоша')
  })

  it('shows a promo discount as its own deduction, not a reduced price', () => {
    const total = calculateTotal(
      [{ slug: 'cherry', quantity: 2 }],
      { courier: 'econt', method: 'office' },
      { delivery: { amountMinor: 499, currency: 'EUR' }, codFee: { amountMinor: 0, currency: 'EUR' } },
      { code: 'WELCOME10', amount: { amountMinor: 400, currency: 'EUR' } }
    )
    if (total.status !== 'ok') throw new Error('fixture is not priced')

    const email = buildCustomerOrderEmail(data({ total }))

    expect(email.text).toContain('WELCOME10')
    expect(email.text).toContain('39,98')
    expect(email.text).toContain('4,00')
  })

  it('writes in English when the customer checked out in English', () => {
    const email = buildCustomerOrderEmail(data({ locale: 'en' }))

    expect(email.subject).toContain('confirmed')
    expect(email.text).toContain('cash on delivery')
  })

  it('falls back to Bulgarian for an unknown locale rather than refusing', () => {
    const email = buildCustomerOrderEmail(data({ locale: 'de' }))

    expect(email.text).toContain('наложен платеж')
  })

  it('escapes customer text in the HTML part', () => {
    const email = buildCustomerOrderEmail(
      data({ delivery: { ...delivery, note: '<script>alert(1)</script>' } })
    )

    expect(email.html).toBeDefined()
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })

  it('carries the same total in both parts', () => {
    const email = buildCustomerOrderEmail(data())

    expect(email.text).toContain('44,97')
    expect(email.html).toContain('44,97')
  })
})

describe('buildShopOrderEmail', () => {
  it('goes to the shop and replies to the customer', () => {
    const email = buildShopOrderEmail(data(), 'orders@example.com')

    expect(email.to).toBe('orders@example.com')
    expect(email.replyTo).toBe('maria@example.com')
  })

  it('puts the order number and the amount in the subject', () => {
    const email = buildShopOrderEmail(data(), 'orders@example.com')

    expect(email.subject).toContain('55C-2026-000123')
    expect(email.subject).toContain('44,97')
  })

  it('carries what is needed to pack and ship without opening the admin', () => {
    const email = buildShopOrderEmail(data(), 'orders@example.com')

    expect(email.text).toContain(cherry.name)
    expect(email.text).toContain('+359888123456')
    expect(email.text).toContain('Офис Витоша')
    expect(email.text).toContain('Econt')
    // The weight decides the courier band, so whoever hands the parcel over needs it.
    expect(email.text).toContain('г')
  })

  it('warns when the office was not confirmed by the courier', () => {
    const email = buildShopOrderEmail(data({ officeVerified: false }), 'orders@example.com')

    expect(email.text).toContain('НЕ е потвърден')
  })

  it('says nothing about verification for a door delivery', () => {
    const email = buildShopOrderEmail(
      data({
        delivery: { ...delivery, method: 'door', street: 'ул. Иван Вазов 5', officeId: '' },
        officeVerified: false,
      }),
      'orders@example.com'
    )

    expect(email.text).not.toContain('НЕ е потвърден')
  })

  it('is Bulgarian even when the customer browsed in English', () => {
    const email = buildShopOrderEmail(data({ locale: 'en' }), 'orders@example.com')

    expect(email.text).toContain('Нова поръчка')
  })

  it('notes a customer who left no email address', () => {
    const email = buildShopOrderEmail(
      data({ delivery: { ...delivery, email: '' } }),
      'orders@example.com'
    )

    expect(email.replyTo).toBeUndefined()
    expect(email.text).toContain('без имейл')
  })

  it('points the customer’s reply at a mailbox that is read', () => {
    // `from` can only send, so the confirmation carries a reply address. The
    // email invites a reply in both languages; this is what makes that true.
    const email = buildCustomerOrderEmail(data(), ['one@example.com', 'two@example.com'])
    expect(email.replyTo).toEqual(['one@example.com', 'two@example.com'])

    expect(buildCustomerOrderEmail(data(), []).replyTo).toBeUndefined()
    expect(buildCustomerOrderEmail(data()).replyTo).toBeUndefined()
  })
})
