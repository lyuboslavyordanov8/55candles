import { describe, it, expect, afterEach, vi } from 'vitest'

import {
  INVOICEABLE_ORDER_STATUSES,
  defaultBuyerFor,
  invoiceBlocker,
  invoiceIssuer,
  invoiceSnapshot,
  missingSellerDetails,
  readSnapshot,
  snapshotCurrency,
  type InvoiceSnapshot,
} from '@/lib/invoices'
import { orderStatus, type Invoice, type Order, type OrderItem } from '@/db/schema'

/**
 * What goes on a фактура, and when one may be issued (AUDIT.md Q-27, Phase 7).
 *
 * `issueInvoiceForOrder` writes to the database — the same convention as
 * `createOrder` and `issueWaybillForOrder`, so it is not tested here. Its one
 * irreplaceable property (a gap-free number, minted in the same statement as the
 * row) is a property of Postgres and of the unique index, not of JavaScript, and a
 * mocked driver would assert only that the string still contains the SQL we wrote.
 *
 * What *is* tested is everything that decides the content of a legal document: an
 * invoice with the wrong amount, the wrong date of the taxable event, or a missing
 * ЕИК is one the customer's accountant sends back.
 */

const PLACED: Order = {
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

const ITEM: OrderItem = {
  id: '22222222-2222-2222-2222-222222222222',
  orderId: PLACED.id,
  productSlug: 'amber-noir',
  name: 'Amber Noir',
  unitPriceMinor: 750,
  currency: 'EUR',
  quantity: 2,
  lineTotalMinor: 1500,
  unitWeightGrams: 275,
  vatRateBasisPoints: null,
}

function order(overrides: Partial<Order> = {}): Order {
  return { ...PLACED, ...overrides }
}

/** The issuer's name is configuration, so every test that needs one sets it. */
function configured() {
  vi.stubEnv('INVOICE_ISSUER_NAME', 'Любослав Йорданов')
}

function snapshot(overrides: { order?: Order; items?: OrderItem[] } = {}): InvoiceSnapshot {
  return invoiceSnapshot({
    order: overrides.order ?? PLACED,
    items: overrides.items ?? [ITEM],
    buyer: defaultBuyerFor(overrides.order ?? PLACED),
    number: '0000000001',
    issuedAt: new Date('2026-09-22T08:30:00Z'),
    issuedBy: 'Любослав Йорданов',
  })
}

function existing(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    number: '0000000007',
    orderId: PLACED.id,
    issuedAt: new Date('2026-09-22T08:30:00Z'),
    saleDate: null,
    totalMinor: 1999,
    currency: 'EUR',
    snapshot: snapshot(),
    createdAt: new Date('2026-09-22T08:30:00Z'),
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('invoiceIssuer', () => {
  it('is the configured name', () => {
    configured()
    expect(invoiceIssuer()).toBe('Любослав Йорданов')
  })

  it('is null when nobody is configured, because a document needs a person', () => {
    vi.stubEnv('INVOICE_ISSUER_NAME', '')
    expect(invoiceIssuer()).toBeNull()
  })

  it('ignores surrounding whitespace rather than printing it', () => {
    vi.stubEnv('INVOICE_ISSUER_NAME', '  Любослав Йорданов  ')
    expect(invoiceIssuer()).toBe('Любослав Йорданов')
  })
})

describe('missingSellerDetails', () => {
  it('needs only the issuer once the company details are filled in', () => {
    vi.stubEnv('INVOICE_ISSUER_NAME', '')
    // Everything else comes from `company.ts`, which the owner has completed —
    // this test fails the day a `[TODO:]` marker returns to the identity fields.
    expect(missingSellerDetails()).toEqual(['INVOICE_ISSUER_NAME'])
  })

  it('is empty when the issuer is configured', () => {
    configured()
    expect(missingSellerDetails()).toEqual([])
  })
})

describe('invoiceBlocker', () => {
  it('lets a confirmed order through', () => {
    configured()
    expect(invoiceBlocker(order(), null)).toBeNull()
  })

  it('refuses a second invoice and says which one exists', () => {
    configured()
    expect(invoiceBlocker(order(), existing())).toEqual({
      reason: 'alreadyIssued',
      number: '0000000007',
    })
  })

  it('checks for an existing invoice before anything else', () => {
    // An order that is also in the wrong status still reports the invoice it has:
    // "вече има фактура" is the fact the admin needs, and it is the one that
    // cannot be fixed by waiting.
    vi.stubEnv('INVOICE_ISSUER_NAME', '')
    expect(invoiceBlocker(order({ status: 'cancelled' }), existing())).toEqual({
      reason: 'alreadyIssued',
      number: '0000000007',
    })
  })

  it('refuses before the order is confirmed', () => {
    configured()
    expect(invoiceBlocker(order({ status: 'awaiting_cod' }), null)).toEqual({
      reason: 'wrongStatus',
      status: 'awaiting_cod',
    })
  })

  it('refuses a sale that did not happen or was undone', () => {
    configured()

    for (const status of ['refused_at_delivery', 'returned', 'cancelled', 'refunded'] as const) {
      expect(invoiceBlocker(order({ status }), null)).toEqual({ reason: 'wrongStatus', status })
    }
  })

  it('allows exactly the statuses in INVOICEABLE_ORDER_STATUSES', () => {
    configured()

    const allowed = orderStatus.enumValues.filter(
      (status) => invoiceBlocker(order({ status }), null) === null
    )

    expect(allowed).toEqual([...INVOICEABLE_ORDER_STATUSES])
  })

  it('refuses when the seller has no name to put under „съставил“', () => {
    vi.stubEnv('INVOICE_ISSUER_NAME', '')
    expect(invoiceBlocker(order(), null)).toEqual({
      reason: 'sellerIncomplete',
      missing: ['INVOICE_ISSUER_NAME'],
    })
  })
})

describe('defaultBuyerFor', () => {
  it('names the person on the order', () => {
    expect(defaultBuyerFor(order()).name).toBe('Мария Иванова')
  })

  it('uses the office as the address for an office delivery', () => {
    expect(defaultBuyerFor(order()).address).toBe('Офис Пловдив Кършияка, 4000 Пловдив')
  })

  it('uses the street for a door delivery', () => {
    const buyer = defaultBuyerFor(
      order({ deliveryMethod: 'door', street: 'ул. Иван Вазов 12, ет. 3', city: 'София', postCode: '1000' })
    )

    expect(buyer.address).toBe('ул. Иван Вазов 12, ет. 3, 1000 София')
  })

  it('leaves nothing dangling when the office has no name', () => {
    expect(defaultBuyerFor(order({ officeName: '' })).address).toBe('4000 Пловдив')
  })

  it('carries no company details, because the checkout never asked for any', () => {
    const buyer = defaultBuyerFor(order())
    expect(buyer.company).toBeUndefined()
    expect(buyer.eik).toBeUndefined()
  })
})

describe('invoiceSnapshot', () => {
  it('snapshots the seller, so a later move of the seat does not rewrite it', () => {
    const { seller } = snapshot()

    expect(seller.legalName).toBe('ВиреонЛабс ЕООД')
    expect(seller.eik).toBe('208907603')
    expect(seller.city).toBe('София')
    expect(seller.address).toContain('1734 София')
  })

  it('carries no VAT number, because the company is not registered', () => {
    expect(snapshot().seller.vatNumber).toBeNull()
  })

  it('states the reason no VAT is charged', () => {
    // An invoice with neither a VAT amount nor a basis looks like one where the
    // tax was forgotten. The wording is the one the price terms already use.
    expect(snapshot().vatNote).toBe('Не се начислява ДДС на основание чл. 113, ал. 9 от ЗДДС')
  })

  it('names наложен платеж as the way it is paid', () => {
    expect(snapshot().paymentNote).toContain('Наложен платеж')
  })

  it('copies the money from the order, to the cent', () => {
    expect(snapshot().money).toEqual({
      currency: 'EUR',
      goodsMinor: 1500,
      discountMinor: 0,
      promoCode: '',
      shippingMinor: 499,
      codFeeMinor: 0,
      totalMinor: 1999,
    })
  })

  it('keeps the discount and its code as their own fields', () => {
    const { money } = snapshot({
      order: order({ discountMinor: 200, promoCode: 'ESEN10', totalMinor: 1799 }),
    })

    // The document has to show the agreed price and the reduction off it, not a
    // net figure nobody can reconcile against what the customer was shown.
    expect(money.discountMinor).toBe(200)
    expect(money.promoCode).toBe('ESEN10')
    expect(money.totalMinor).toBe(1799)
  })

  it('copies the lines as they were bought', () => {
    expect(snapshot().lines).toEqual([
      {
        name: 'Amber Noir',
        productSlug: 'amber-noir',
        quantity: 2,
        unitPriceMinor: 750,
        lineTotalMinor: 1500,
      },
    ])
  })

  it('has no date of the taxable event while the goods have not moved', () => {
    // An invoice put in the parcel is issued before delivery, and inventing a
    // sale date would date the sale before it happened.
    expect(snapshot().saleDate).toBeNull()
  })

  it('dates the taxable event to the delivery', () => {
    const delivered = new Date('2026-09-24T14:05:00Z')
    expect(snapshot({ order: order({ status: 'delivered', deliveredAt: delivered }) }).saleDate).toBe(
      delivered.toISOString()
    )
  })

  it('falls back to the collection of the cash when delivery went unrecorded', () => {
    const collected = new Date('2026-09-25T10:00:00Z')

    expect(
      snapshot({ order: order({ status: 'cod_collected', codCollectedAt: collected }) }).saleDate
    ).toBe(collected.toISOString())
  })

  it('prefers the delivery date over the collection date', () => {
    const delivered = new Date('2026-09-24T14:05:00Z')
    const collected = new Date('2026-09-25T10:00:00Z')

    expect(
      snapshot({
        order: order({ status: 'cod_collected', deliveredAt: delivered, codCollectedAt: collected }),
      }).saleDate
    ).toBe(delivered.toISOString())
  })

  it('points back at the order it invoices', () => {
    const built = snapshot()
    expect(built.orderNumber).toBe('55C-2026-000123')
    expect(built.orderPlacedAt).toBe(PLACED.createdAt.toISOString())
  })

  it('drops empty company fields instead of storing blanks', () => {
    const built = invoiceSnapshot({
      order: PLACED,
      items: [ITEM],
      buyer: { name: '  Мария Иванова ', company: '', eik: '   ', address: 'Пловдив' },
      number: '0000000001',
      issuedAt: new Date('2026-09-22T08:30:00Z'),
      issuedBy: 'Любослав Йорданов',
    })

    expect(built.buyer).toEqual({ name: 'Мария Иванова', address: 'Пловдив' })
  })

  it('keeps the company details when they are given', () => {
    const built = invoiceSnapshot({
      order: PLACED,
      items: [ITEM],
      buyer: {
        name: 'Мария Иванова',
        company: 'Пример ООД',
        eik: '123456789',
        vatNumber: 'BG123456789',
        accountable: 'Иван Петров',
        address: 'София, ул. Тест 1',
      },
      number: '0000000001',
      issuedAt: new Date('2026-09-22T08:30:00Z'),
      issuedBy: 'Любослав Йорданов',
    })

    expect(built.buyer.company).toBe('Пример ООД')
    expect(built.buyer.eik).toBe('123456789')
    expect(built.buyer.vatNumber).toBe('BG123456789')
    expect(built.buyer.accountable).toBe('Иван Петров')
  })

  it('records who issued it and when', () => {
    const built = snapshot()
    expect(built.issuedBy).toBe('Любослав Йорданов')
    expect(built.issuedAt).toBe('2026-09-22T08:30:00.000Z')
  })

  it('is versioned, so a reader can tell what shape it has', () => {
    expect(snapshot().version).toBe(1)
  })

  it('survives a round trip through jsonb', () => {
    const built = snapshot()
    // What Postgres gives back is the parse of what we sent, so anything that
    // does not survive `JSON` is a field the document would lose.
    expect(JSON.parse(JSON.stringify(built))).toEqual(built)
  })
})

describe('readSnapshot', () => {
  it('reads back what invoiceSnapshot wrote', () => {
    const built = snapshot()
    expect(readSnapshot(JSON.parse(JSON.stringify(built)))).toEqual(built)
  })

  it('refuses anything that is not a snapshot', () => {
    for (const value of [null, undefined, 'x', 42, [], {}]) {
      expect(readSnapshot(value)).toBeNull()
    }
  })

  it('refuses a version it does not know, instead of rendering blanks', () => {
    expect(readSnapshot({ ...snapshot(), version: 2 })).toBeNull()
  })

  it('refuses a row missing the parts the document is made of', () => {
    const { seller, ...withoutSeller } = snapshot()
    expect(seller).toBeDefined()
    expect(readSnapshot(withoutSeller)).toBeNull()

    expect(readSnapshot({ ...snapshot(), lines: 'nope' })).toBeNull()
  })
})

describe('snapshotCurrency', () => {
  it('is the currency the invoice was issued in', () => {
    expect(snapshotCurrency(snapshot())).toBe('EUR')
  })
})
