import { describe, it, expect } from 'vitest'
import {
  buildItemRows,
  formatOrderNumber,
  INITIAL_ORDER_STATUS,
  newIntentToken,
  ORDER_NUMBER_PREFIX,
  type PricedTotal,
} from '@/lib/orders'
import { calculateTotal } from '@/lib/order-total'
import { eur } from '@/lib/money'
import { products } from '@/data/products'
import { orderStatus } from '@/db/schema'

/**
 * Order creation, minus the database (AUDIT.md B-08, B-09).
 *
 * `createOrder()` itself is one batch of SQL against Neon, so it is verified
 * against the real database rather than a mock of it — see the note at the end of
 * this file. What is tested here is everything that decides *what* gets written:
 * the status a new order starts in, the printed number, and the line snapshot.
 * Those are the parts that would silently misstate an invoice if they were wrong.
 */

/** A real total, computed the way the action computes it. */
function pricedTotal(quantity = 2): PricedTotal {
  const total = calculateTotal([{ slug: 'cherry', quantity }], {
    courier: 'econt',
    method: 'office',
  })

  if (total.status !== 'ok') throw new Error('fixture is unpriced; check pricing and tariffs')
  return total
}

const ORDER_ID = '0f0c2f35-d1b6-4b52-9d9c-2c9d1f8b7a11'

describe('INITIAL_ORDER_STATUS', () => {
  it('starts every order confirmed but unpaid', () => {
    // Cash on delivery is the only method: the courier collects on delivery and
    // remits later, so an order is real and the money is not here yet (B-14).
    expect(INITIAL_ORDER_STATUS).toBe('awaiting_cod')
  })

  it('is not a paid state, and there is none to reach at checkout', () => {
    // Nothing in this shop can record money as received. The status enum has no
    // `paid` value at all — collection is reported by the courier and then
    // reconciled against its remittance.
    expect(orderStatus.enumValues).not.toContain('paid')
  })
})

describe('formatOrderNumber', () => {
  it('reads as a reference a human can quote over the phone', () => {
    expect(formatOrderNumber(123, 2026)).toBe('55C-2026-000123')
  })

  it('pads to a fixed width, so numbers sort and line up on paperwork', () => {
    expect(formatOrderNumber(1, 2026)).toBe('55C-2026-000001')
    expect(formatOrderNumber(999999, 2026)).toBe('55C-2026-999999')
  })

  it('does not truncate once the counter outgrows its padding', () => {
    // Better a longer number than two orders sharing one.
    expect(formatOrderNumber(1000000, 2026)).toBe('55C-2026-1000000')
  })

  it('takes the year from the order, not from the counter', () => {
    // The sequence does not restart each year — see `orderNumberSeq` — so the
    // same counter in a new year is a different, still-unique number.
    expect(formatOrderNumber(500, 2027)).toBe(`${ORDER_NUMBER_PREFIX}-2027-000500`)
  })
})

describe('newIntentToken', () => {
  it('is different every time it is called', () => {
    // It is minted once per page render. Two renders must not collide, or the
    // second customer's submission would return the first one's order.
    const tokens = new Set(Array.from({ length: 50 }, newIntentToken))

    expect(tokens.size).toBe(50)
  })
})

describe('buildItemRows', () => {
  it('copies the price and the name, so a later edit cannot rewrite history', () => {
    const [row] = buildItemRows(ORDER_ID, pricedTotal())
    const cherry = products.find((product) => product.slug === 'cherry')

    expect(row.orderId).toBe(ORDER_ID)
    expect(row.productSlug).toBe('cherry')
    expect(row.name).toBe(cherry?.name)
    expect(row.unitPriceMinor).toBe(eur(19.99).amountMinor)
    expect(row.currency).toBe('EUR')
    expect(row.quantity).toBe(2)
    expect(row.lineTotalMinor).toBe(eur(39.98).amountMinor)
  })

  it('stores the weight per unit, not the weight of the line', () => {
    // `PricedLine.weightGrams` is the whole line, the column is per unit, and
    // getting this backwards would multiply the shipping band by the quantity
    // twice when the order is re-quoted.
    const one = buildItemRows(ORDER_ID, pricedTotal(1))[0]
    const three = buildItemRows(ORDER_ID, pricedTotal(3))[0]

    expect(three.unitWeightGrams).toBe(one.unitWeightGrams)
  })

  it('leaves the VAT rate null while the VAT position is unresolved', () => {
    // A zero would be a claim that these sales carry no VAT. Nobody has
    // established that (Q-03), so the column says "unknown" instead.
    expect(buildItemRows(ORDER_ID, pricedTotal())[0].vatRateBasisPoints).toBeNull()
  })

  it('writes one row per basket line', () => {
    const total = calculateTotal(
      [
        { slug: 'cherry', quantity: 1 },
        { slug: 'vanilla', quantity: 2 },
      ],
      { courier: 'econt', method: 'office' }
    )
    if (total.status !== 'ok') throw new Error('fixture is unpriced')

    expect(buildItemRows(ORDER_ID, total).map((row) => row.productSlug)).toEqual([
      'cherry',
      'vanilla',
    ])
  })

  it('falls back to the slug if a product has left the catalogue', () => {
    // Not reachable from a real basket — `calculateTotal` rejects unknown slugs
    // — but an order line with an empty name is unreadable on a packing list,
    // and the slug is at least identifiable.
    const total = pricedTotal()
    const orphaned: PricedTotal = {
      ...total,
      lines: [{ ...total.lines[0], slug: 'discontinued-scent' }],
    }

    expect(buildItemRows(ORDER_ID, orphaned)[0].name).toBe('discontinued-scent')
  })
})

/**
 * Not tested here, deliberately: `createOrder()`'s idempotency and its single
 * batched transaction. Both are properties of Postgres — a unique index on
 * `intent_token` and the rollback that follows violating it — so a mocked driver
 * would only assert that we call the functions we call, while proving nothing
 * about the guarantee. They were verified against the real Neon database, and the
 * check is worth repeating after any change to the batch: submit the same intent
 * token twice and confirm one `orders` row, its items, and one `order_events` row.
 */
