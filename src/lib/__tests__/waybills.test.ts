import { describe, it, expect, afterEach, vi } from 'vitest'

import {
  BOOKABLE_ORDER_STATUSES,
  labelPdfUrl,
  waybillBlocker,
  waybillRequestFor,
} from '@/lib/waybills'
import { orderStatus, paymentMethod, type Order, type OrderEvent } from '@/db/schema'

/**
 * Deciding whether to book a parcel, and what to book (AUDIT.md Phase 4).
 *
 * `issueWaybillForOrder` writes to the database and calls the courier, so it is
 * not tested here — the same convention as `createOrder`. What *is* tested is the
 * pure half, and that is where the expensive mistakes live: a parcel booked for an
 * order that already has one is billed twice, and a parcel booked with the wrong
 * amount hands the customer's money to nobody.
 */

const BOOKABLE: Order = {
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
  return { ...BOOKABLE, ...overrides }
}

/** Everything the courier needs configured, so the gate is the only variable. */
function configured() {
  vi.stubEnv('ECONT_USERNAME', 'merchant')
  vi.stubEnv('ECONT_PASSWORD', 'secret')
  vi.stubEnv('ECONT_SENDER_OFFICE_CODE', '1120')
  vi.stubEnv('ECONT_SENDER_PHONE', '+359888123456')
  vi.stubEnv('ECONT_SENDER_MOL_NAME', 'Иван Иванов')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('whether an order may be booked', () => {
  it('allows a confirmed order with everything configured', () => {
    configured()

    expect(waybillBlocker(order())).toBeNull()
  })

  it('refuses an order that already has a number, and says which', () => {
    // The whole point of the module: a second waybill is a second parcel Econt
    // invoices for, and this is the check that stops a reloaded tab from making
    // one.
    configured()

    expect(waybillBlocker(order({ waybillNumber: '1053118220' }))).toEqual({
      reason: 'alreadyIssued',
      waybillNumber: '1053118220',
    })
  })

  it('refuses an order nobody has confirmed yet', () => {
    // A brand-new order may be a duplicate or a mistake, and an unprinted label
    // costs nothing while a printed one does.
    configured()

    expect(waybillBlocker(order({ status: 'awaiting_cod' }))).toEqual({
      reason: 'wrongStatus',
      status: 'awaiting_cod',
    })
  })

  it('books in exactly the two statuses where a parcel is real but not yet gone', () => {
    configured()

    const allowed = orderStatus.enumValues.filter(
      (status) => waybillBlocker(order({ status })) === null
    )

    expect(allowed).toEqual([...BOOKABLE_ORDER_STATUSES])
  })

  it('refuses Speedy and names its own variables, not Econt’s', () => {
    // `configured()` sets up Econt. Speedy has a real client now, so the reason
    // it cannot book is its own missing configuration — and the admin needs to be
    // told which variables those are, not that "Speedy" is unavailable.
    configured()

    expect(waybillBlocker(order({ courier: 'speedy' }))).toEqual({
      reason: 'notBookable',
      courier: 'speedy',
      missing: ['SPEEDY_USERNAME', 'SPEEDY_PASSWORD', 'SPEEDY_SENDER_CLIENT_ID'],
    })
  })

  it('refuses Econt while the label sender is unconfigured, naming the variable', () => {
    vi.stubEnv('ECONT_USERNAME', 'merchant')
    vi.stubEnv('ECONT_PASSWORD', 'secret')
    vi.stubEnv('ECONT_SENDER_OFFICE_CODE', '1120')

    expect(waybillBlocker(order())).toEqual({
      reason: 'notBookable',
      courier: 'econt',
      missing: ['ECONT_SENDER_PHONE', 'ECONT_SENDER_MOL_NAME'],
    })
  })

  it('checks the number before the status, so a shipped order reads as done', () => {
    // `shipped` is not bookable *and* has a number. "Вече има товарителница" is the
    // useful answer; "wrong status" would send the admin looking for a bug.
    configured()

    expect(waybillBlocker(order({ status: 'shipped', waybillNumber: '1053118220' }))).toMatchObject({
      reason: 'alreadyIssued',
    })
  })
})

describe('the parcel we ask for', () => {
  it('sends the office code and no address, so Econt cannot pick the other one', () => {
    const request = waybillRequestFor(order())

    expect(request.method).toBe('office')
    expect(request.officeId).toBe('4015')
    expect(request.address).toBeUndefined()
  })

  it('sends the address and no office code for a door delivery', () => {
    // Both are populated in the row — `office_id` has a default — so sending the
    // whole order would be ambiguous.
    const request = waybillRequestFor(
      order({
        deliveryMethod: 'door',
        street: 'ул. Христо Ботев 15, ап. 9',
        officeId: '4015',
      })
    )

    expect(request.address).toEqual({
      city: 'Пловдив',
      postCode: '4000',
      street: 'ул. Христо Ботев 15, ап. 9',
    })
    expect(request.officeId).toBeUndefined()
  })

  it('collects the total the customer agreed to, not a recomputed one', () => {
    // Tariffs and basket rules change; `total_minor` is what the confirmation
    // email said, and that is the figure the courier must collect.
    expect(waybillRequestFor(order({ totalMinor: 1999 })).codAmount).toEqual({
      amountMinor: 1999,
      currency: 'EUR',
    })
  })

  it('asks for collection only because the order says наложен платеж', () => {
    // `payment_method` has exactly one value today, so the null branch in
    // `waybillRequestFor` is unreachable — deliberately. The day a prepaid method
    // is added, this test fails and points at the code that must not send that
    // order's total to the courier to collect a second time.
    expect(paymentMethod.enumValues).toEqual(['cod'])
    expect(waybillRequestFor(order()).codAmount).not.toBeNull()
  })

  it('passes the customer through with the order number for the shelf', () => {
    expect(waybillRequestFor(order())).toMatchObject({
      recipient: {
        name: 'Мария Иванова',
        phone: '+359887115957',
        email: 'maria@example.com',
      },
      orderNumber: '55C-2026-000123',
      weightGrams: 550,
    })
  })

  it('omits the email rather than sending the empty default', () => {
    // The column is `not null default ''`, and Econt would take '' as an address
    // to notify.
    expect(waybillRequestFor(order({ email: '' })).recipient.email).toBeUndefined()
  })
})

/**
 * The label PDF, found in the order's own history.
 *
 * Read by two callers now — the page that renders the button and the route that
 * streams the file — which is why it lives in `waybills.ts` beside the code that
 * writes the event rather than in either of them.
 */
describe('the label PDF on an order', () => {
  const event = (detail: unknown, at: string): OrderEvent => ({
    id: '22222222-2222-2222-2222-222222222222',
    orderId: BOOKABLE.id,
    fromStatus: 'confirmed',
    toStatus: 'confirmed',
    actor: 'admin',
    detail: detail as OrderEvent['detail'],
    createdAt: new Date(at),
  })

  it('finds the link recorded when the parcel was booked', () => {
    const events = [
      event({ note: 'confirmed by hand' }, '2026-09-22T06:00:00Z'),
      event({ waybillPdfUrl: 'https://ee.econt.com/services/PDFService.getPDF.json?id=1' }, '2026-09-22T07:00:00Z'),
    ]

    expect(labelPdfUrl(events)).toBe('https://ee.econt.com/services/PDFService.getPDF.json?id=1')
  })

  it('prefers the newest, because a rebooked parcel has a newer label', () => {
    const events = [
      event({ waybillPdfUrl: 'https://ee.econt.com/services/PDFService.getPDF.json?id=1' }, '2026-09-22T07:00:00Z'),
      event({ waybillPdfUrl: 'https://ee.econt.com/services/PDFService.getPDF.json?id=2' }, '2026-09-22T08:00:00Z'),
    ]

    expect(labelPdfUrl(events)).toBe('https://ee.econt.com/services/PDFService.getPDF.json?id=2')
  })

  it('has nothing to offer for an order that was never booked', () => {
    expect(labelPdfUrl([event({ note: 'confirmed by hand' }, '2026-09-22T06:00:00Z')])).toBeNull()
  })

  it('refuses anything that is not an https URL', () => {
    // The value arrives in the courier's JSON and is then both an `href` and a
    // server-side fetch target, so `https://` is checked here rather than trusted
    // twice downstream.
    for (const hostile of ['javascript:alert(1)', 'http://ee.econt.com/label', 'file:///etc/passwd', 42]) {
      expect(labelPdfUrl([event({ waybillPdfUrl: hostile }, '2026-09-22T07:00:00Z')])).toBeNull()
    }
  })
})
