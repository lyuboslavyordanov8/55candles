import 'server-only'

import { courierClient } from './couriers'
import type { ShipmentTracking } from './couriers/types'
import type { Courier } from './shipping'

/**
 * Live parcel status for the admin, read from the courier on every page load.
 *
 * Nothing here is written back to the order. The courier's view and the order's
 * status are shown side by side, and moving the order stays a human decision:
 * a courier saying "Доставена" is not the shop agreeing the parcel arrived, and a
 * job that advanced orders by itself would also be the one thing on this site
 * that changes live data with nobody watching.
 *
 * One request per courier however many orders are asked about, because the
 * orders list asks about a whole page at once.
 */

export type TrackingLookup =
  | { state: 'ok'; tracking: ShipmentTracking }
  /** The courier answered, and does not know this number. */
  | { state: 'missing'; reason: string }
  /** The courier did not answer. Says nothing about the parcel. */
  | { state: 'failed'; reason: string }
  /** Tracking is not available for this courier yet. */
  | { state: 'unavailable' }

export interface TrackableOrder {
  courier: Courier
  waybillNumber: string | null
}

/** Status of every order that has a waybill, keyed by waybill number. */
export async function trackOrders(
  orders: readonly TrackableOrder[]
): Promise<Map<string, TrackingLookup>> {
  const byCourier = new Map<Courier, string[]>()

  for (const order of orders) {
    const number = order.waybillNumber?.trim()
    if (!number) continue

    const numbers = byCourier.get(order.courier) ?? []
    if (!numbers.includes(number)) numbers.push(number)
    byCourier.set(order.courier, numbers)
  }

  const results = new Map<string, TrackingLookup>()

  await Promise.all(
    [...byCourier].map(async ([courier, numbers]) => {
      let result
      try {
        result = await courierClient(courier).trackShipments(numbers)
      } catch (error) {
        // Read-only and best-effort: a courier bug must not take the admin page down.
        console.error(`[tracking] ${courier} threw`, error)
        result = { status: 'failed' as const, reason: 'unexpected error' }
      }

      for (const number of numbers) {
        if (result.status === 'unconfigured') {
          results.set(number, { state: 'unavailable' })
        } else if (result.status === 'failed') {
          results.set(number, { state: 'failed', reason: result.reason })
        }
      }

      if (result.status !== 'ok') return

      for (const tracking of result.data.found) {
        results.set(tracking.number, { state: 'ok', tracking })
      }
      for (const miss of result.data.missing) {
        results.set(miss.number, { state: 'missing', reason: miss.reason })
      }
    })
  )

  return results
}

/** One order's status, or `null` when it has no waybill. */
export async function trackOrder(order: TrackableOrder): Promise<TrackingLookup | null> {
  const number = order.waybillNumber?.trim()
  if (!number) return null

  return (await trackOrders([order])).get(number) ?? { state: 'failed', reason: 'no answer' }
}
