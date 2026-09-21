import { describe, it, expect } from 'vitest'

import { dateRangeBounds, undoEligibility, UNDO_WINDOW_MS } from '@/lib/admin-orders'
import type { OrderEvent, OrderStatus } from '@/db/schema'

/**
 * The pure decision logic in `admin-orders.ts` (order-management back office).
 *
 * `listOrders`, `getOrderDetail`, `refusalHistory`, `revertLastStatusChange` and
 * `advanceOrderStatus` all write to or read from the database and are not
 * unit-tested here — the same convention as `createOrder` (`orders.test.ts`) and
 * `issueWaybillForOrder` (`waybills.test.ts`): a mocked driver would only assert
 * that the right functions are called, proving nothing about what Postgres
 * actually does with a `gte`/`ilike`/`and`. What is tested is the two pieces that
 * decide *what* those functions do without ever touching a connection.
 */

let eventCounter = 0

function event(overrides: Partial<OrderEvent> = {}): OrderEvent {
  eventCounter += 1
  return {
    id: `event-${eventCounter}`,
    orderId: 'order-1',
    fromStatus: null,
    toStatus: 'awaiting_cod',
    actor: 'admin',
    detail: null,
    createdAt: new Date('2026-09-21T10:00:00Z'),
    ...overrides,
  }
}

describe('dateRangeBounds', () => {
  it('returns nothing when neither end is given', () => {
    expect(dateRangeBounds(undefined, undefined)).toEqual({})
  })

  it('reads "from" as that day\'s midnight UTC', () => {
    expect(dateRangeBounds('2026-09-21', undefined).gte).toEqual(
      new Date('2026-09-21T00:00:00.000Z')
    )
  })

  it('reads "to" as an exclusive bound on the *next* day, so the whole end day is included', () => {
    // The bug this guards against: an order created at 23:47 on the end date
    // must still be inside the range, which `lte` on that day's own midnight
    // would silently drop.
    expect(dateRangeBounds(undefined, '2026-09-21').lt).toEqual(
      new Date('2026-09-22T00:00:00.000Z')
    )
  })

  it('rolls over the month and year correctly at the boundary', () => {
    expect(dateRangeBounds(undefined, '2026-12-31').lt).toEqual(
      new Date('2027-01-01T00:00:00.000Z')
    )
  })

  it('produces a range where "from" and "to" on the same day still includes that day', () => {
    const { gte, lt } = dateRangeBounds('2026-09-21', '2026-09-21')
    const withinRange = new Date('2026-09-21T23:47:00.000Z')

    expect(gte!.getTime()).toBeLessThanOrEqual(withinRange.getTime())
    expect(lt!.getTime()).toBeGreaterThan(withinRange.getTime())
  })
})

describe('undoEligibility', () => {
  const NOW = new Date('2026-09-21T10:05:00Z').getTime()

  it('is not eligible when the order has no history at all', () => {
    expect(undoEligibility([], 'awaiting_cod', NOW)).toEqual({
      eligible: false,
      reason: 'notLastTransition',
    })
  })

  it('is not eligible when the order has never actually transitioned (creation event only)', () => {
    const events = [event({ fromStatus: null, toStatus: 'awaiting_cod', createdAt: new Date(NOW) })]

    expect(undoEligibility(events, 'awaiting_cod', NOW).eligible).toBe(false)
  })

  it('is eligible for a transition inside the window, and names what it would revert to', () => {
    const transitionedAt = new Date(NOW - 30_000)
    const events = [
      event({ fromStatus: null, toStatus: 'awaiting_cod', createdAt: new Date(NOW - 60_000) }),
      event({ fromStatus: 'awaiting_cod', toStatus: 'confirmed', createdAt: transitionedAt }),
    ]

    const result = undoEligibility(events, 'confirmed', NOW)

    expect(result).toEqual({ eligible: true, event: events[1], revertTo: 'awaiting_cod' })
  })

  it('is not eligible once the window has closed', () => {
    const events = [
      event({ fromStatus: null, toStatus: 'awaiting_cod', createdAt: new Date(NOW - 300_000) }),
      event({
        fromStatus: 'awaiting_cod',
        toStatus: 'confirmed',
        createdAt: new Date(NOW - UNDO_WINDOW_MS - 1_000),
      }),
    ]

    expect(undoEligibility(events, 'confirmed', NOW)).toEqual({
      eligible: false,
      reason: 'tooLate',
    })
  })

  it('skips a same-status note and still finds the real transition underneath it', () => {
    // The waybill module, and the standalone "add a note" action, both write
    // fromStatus === toStatus events. Neither should block or consume the
    // undo window for the transition that came before it.
    const transitionedAt = new Date(NOW - 30_000)
    const events = [
      event({ fromStatus: 'awaiting_cod', toStatus: 'confirmed', createdAt: transitionedAt }),
      event({ fromStatus: 'confirmed', toStatus: 'confirmed', createdAt: new Date(NOW - 10_000) }),
    ]

    const result = undoEligibility(events, 'confirmed', NOW)

    expect(result).toEqual({ eligible: true, event: events[0], revertTo: 'awaiting_cod' })
  })

  it('refuses when the order has moved on again since the transition being undone', () => {
    // Another admin (or the same one, twice) advanced it further. Undoing the
    // *first* transition now would silently skip past the second one.
    const events = [
      event({ fromStatus: 'awaiting_cod', toStatus: 'confirmed', createdAt: new Date(NOW - 90_000) }),
      event({ fromStatus: 'confirmed', toStatus: 'packed', createdAt: new Date(NOW - 30_000) }),
    ]

    // The order is genuinely 'packed' now, but the caller (a stale page, say)
    // still believes 'confirmed' is current.
    expect(undoEligibility(events, 'confirmed' as OrderStatus, NOW)).toEqual({
      eligible: false,
      reason: 'notLastTransition',
    })
  })

  it('reads events oldest-first, matching getOrderDetail and its own query', () => {
    // Same case as the eligible test above, just asserting the function does
    // not assume a particular array order beyond "ascending by createdAt".
    const events = [
      event({ fromStatus: null, toStatus: 'awaiting_cod', createdAt: new Date(NOW - 120_000) }),
      event({ fromStatus: 'awaiting_cod', toStatus: 'confirmed', createdAt: new Date(NOW - 60_000) }),
      event({ fromStatus: 'confirmed', toStatus: 'confirmed', createdAt: new Date(NOW - 5_000) }),
    ]

    expect(undoEligibility(events, 'confirmed', NOW).eligible).toBe(true)
  })
})
