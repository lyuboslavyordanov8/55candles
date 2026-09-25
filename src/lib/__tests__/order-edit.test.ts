import { describe, it, expect } from 'vitest'

import {
  changesBetween,
  columnsFor,
  DELETABLE_ORDER_STATUSES,
  deleteBlocker,
  deliveryDetailsOf,
  EDITABLE_ORDER_STATUSES,
  editBlocker,
} from '@/lib/order-edit'
import { orderStatus, type Order } from '@/db/schema'

/**
 * Correcting and deleting an order from the admin.
 *
 * `updateOrderDetails` and `deleteOrder` write to the database, so — the same
 * convention as `issueWaybillForOrder` — only the pure half is tested: when an
 * order may be touched at all, and what an edit writes and records.
 */

const ORDER: Order = {
  id: '11111111-1111-1111-1111-111111111111',
  orderNumber: '55C-2026-000123',
  intentToken: 'intent-1',
  publicToken: 'public-1',
  status: 'confirmed',
  recipientName: 'Мария Иванова',
  phone: '+359887115957',
  email: 'maria@example.com',
  country: 'BG',
  city: 'Пловдив',
  postCode: '4000',
  street: '',
  note: '',
  courier: 'econt',
  deliveryMethod: 'office',
  officeId: '4015',
  officeName: 'Пловдив Кършияка',
  officeAddress: 'бул. Дунав 5',
  currency: 'EUR',
  goodsMinor: 1500,
  discountMinor: 0,
  promoCode: '',
  shippingMinor: 499,
  codFeeMinor: 0,
  totalMinor: 1999,
  weightGrams: 550,
  paymentMethod: 'cod',
  codCollectedAt: null,
  waybillNumber: null,
  trackingUrl: null,
  shippedAt: null,
  deliveredAt: null,
  createdAt: new Date('2026-09-21T09:00:00Z'),
  updatedAt: new Date('2026-09-21T09:00:00Z'),
}

function order(overrides: Partial<Order> = {}): Order {
  return { ...ORDER, ...overrides }
}

describe('editBlocker', () => {
  it('allows every status before shipment', () => {
    for (const status of EDITABLE_ORDER_STATUSES) {
      expect(editBlocker(order({ status }))).toBeNull()
    }
  })

  it('refuses every status from shipment on, and a cancelled order', () => {
    const others = orderStatus.enumValues.filter((s) => !EDITABLE_ORDER_STATUSES.includes(s))
    expect(others).toContain('shipped')
    expect(others).toContain('cancelled')

    for (const status of others) {
      expect(editBlocker(order({ status }))).toEqual({ reason: 'wrongStatus', status })
    }
  })

  it('refuses an order with a waybill, even before shipment', () => {
    expect(editBlocker(order({ status: 'packed', waybillNumber: '1055257817054' }))).toEqual({
      reason: 'hasWaybill',
      waybillNumber: '1055257817054',
    })
  })
})

describe('deleteBlocker', () => {
  it('allows a test order with nothing issued', () => {
    expect(deleteBlocker(order(), null)).toBeNull()
  })

  it('allows a cancelled order', () => {
    expect(DELETABLE_ORDER_STATUSES).toContain('cancelled')
    expect(deleteBlocker(order({ status: 'cancelled' }), null)).toBeNull()
  })

  it('never deletes an invoiced order, and says so before anything else', () => {
    expect(deleteBlocker(order({ status: 'shipped', waybillNumber: '1' }), '0000000001')).toEqual({
      reason: 'hasInvoice',
      number: '0000000001',
    })
  })

  it('refuses while a waybill exists', () => {
    expect(deleteBlocker(order({ waybillNumber: '1' }), null)).toEqual({
      reason: 'hasWaybill',
      waybillNumber: '1',
    })
  })

  it('refuses an order that has left the shop', () => {
    for (const status of ['shipped', 'delivered', 'cod_collected', 'returned'] as const) {
      expect(deleteBlocker(order({ status }), null)).toEqual({ reason: 'wrongStatus', status })
    }
  })
})

describe('columnsFor', () => {
  it('round-trips an unchanged order to the same columns', () => {
    const before = columnsFor(deliveryDetailsOf(ORDER))
    expect(changesBetween(before, columnsFor(deliveryDetailsOf(ORDER)))).toEqual({})
    expect(before.officeName).toBe('Пловдив Кършияка')
  })

  it('clears the office when the parcel moves to a door', () => {
    const columns = columnsFor({
      ...deliveryDetailsOf(ORDER),
      method: 'door',
      street: 'ул. Гладстон 12',
    })

    expect(columns).toMatchObject({
      deliveryMethod: 'door',
      street: 'ул. Гладстон 12',
      officeId: '',
      officeName: '',
      officeAddress: '',
    })
  })

  it('clears the street when the parcel moves to an office', () => {
    const door = { ...deliveryDetailsOf(ORDER), method: 'door' as const, street: 'ул. Гладстон 12' }
    const columns = columnsFor({ ...door, method: 'office', officeId: '4016' })

    expect(columns.street).toBe('')
    expect(columns.officeId).toBe('4016')
  })

  it("prefers the courier's own name and address for the office", () => {
    const columns = columnsFor(
      { ...deliveryDetailsOf(ORDER), officeName: 'typed', officeAddress: 'typed' },
      { name: 'Пловдив Център', address: 'ул. Иван Вазов 1' }
    )

    expect(columns.officeName).toBe('Пловдив Център')
    expect(columns.officeAddress).toBe('ул. Иван Вазов 1')
  })
})

describe('changesBetween', () => {
  it('records only what changed, as old → new', () => {
    const before = columnsFor(deliveryDetailsOf(ORDER))
    const after = { ...before, phone: '+359888000111', email: '' }

    expect(changesBetween(before, after)).toEqual({
      phone: '+359887115957 → +359888000111',
      email: 'maria@example.com → —',
    })
  })
})
