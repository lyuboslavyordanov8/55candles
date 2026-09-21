import { describe, it, expect } from 'vitest'

import {
  ALLOWED_TRANSITIONS,
  canTransition,
  nextStatuses,
  OPEN_STATUSES,
  REQUIRES_REASON,
  STATUS_LABELS,
  statusRequiresReason,
} from '@/lib/order-status'
import { orderStatus, type OrderStatus } from '@/db/schema'

/**
 * The status graph (AUDIT.md B-14).
 *
 * These are the rules that stop the admin from misstating the books: money that
 * has not been collected cannot be booked as collected, and a parcel that has not
 * shipped cannot be marked delivered.
 */

describe('ALLOWED_TRANSITIONS', () => {
  it('covers every status in the enum, and invents none', () => {
    // A status added to the schema without a rule here would silently become a
    // dead end — or worse, throw in `canTransition` when an order reached it.
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual([...orderStatus.enumValues].sort())
  })

  it('only ever points at statuses that exist', () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const to of targets) {
        expect(orderStatus.enumValues, `${from} → ${to}`).toContain(to)
      }
    }
  })

  it('never allows a status to transition to itself', () => {
    for (const status of orderStatus.enumValues) {
      expect(canTransition(status, status), status).toBe(false)
    }
  })
})

describe('settlement cannot be short-circuited', () => {
  it('reaches cod_collected only from delivered', () => {
    const sources = orderStatus.enumValues.filter((from) => canTransition(from, 'cod_collected'))
    expect(sources).toEqual(['delivered'])
  })

  it('reaches reconciled only from cod_collected', () => {
    const sources = orderStatus.enumValues.filter((from) => canTransition(from, 'reconciled'))
    expect(sources).toEqual(['cod_collected'])
  })

  it('does not let a new order jump to delivered or shipped', () => {
    expect(canTransition('awaiting_cod', 'delivered')).toBe(false)
    expect(canTransition('awaiting_cod', 'shipped')).toBe(false)
  })

  it('walks the happy path one step at a time', () => {
    const path: OrderStatus[] = [
      'awaiting_cod',
      'confirmed',
      'packed',
      'shipped',
      'delivered',
      'cod_collected',
      'reconciled',
    ]

    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i], path[i + 1]), `${path[i]} → ${path[i + 1]}`).toBe(true)
    }
  })

  it('cannot cancel a parcel that has already gone out', () => {
    expect(canTransition('shipped', 'cancelled')).toBe(false)
    expect(canTransition('delivered', 'cancelled')).toBe(false)
  })

  it('treats settled and closed orders as terminal', () => {
    for (const status of ['reconciled', 'returned', 'cancelled', 'refunded'] as const) {
      expect(nextStatuses(status), status).toEqual([])
    }
  })
})

describe('the admin’s vocabulary', () => {
  it('labels every status, so none renders as a raw enum value', () => {
    for (const status of orderStatus.enumValues) {
      expect(STATUS_LABELS[status], status).toBeTruthy()
    }
  })

  it('counts only pre-shipment work as open', () => {
    // The default list filter. A shipped parcel is no longer the shop's to-do.
    expect(OPEN_STATUSES).not.toContain('shipped')
    expect(OPEN_STATUSES).toContain('awaiting_cod')
  })
})

describe('statusRequiresReason', () => {
  it('requires a reason for exactly the two unhappy-ending statuses', () => {
    // Pinned to the literal list, not derived from it: the point of this test
    // is to notice if REQUIRES_REASON quietly grows or shrinks.
    expect(REQUIRES_REASON).toEqual(['refused_at_delivery', 'returned'])
  })

  it('reports true only for those two statuses', () => {
    for (const status of orderStatus.enumValues) {
      const expected = status === 'refused_at_delivery' || status === 'returned'
      expect(statusRequiresReason(status), status).toBe(expected)
    }
  })
})
