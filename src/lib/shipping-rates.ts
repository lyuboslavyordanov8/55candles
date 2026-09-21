import 'server-only'

import { canQuoteLiveRates, courierClient, type ShipmentRate } from './couriers'
import type { DeliveryDetails } from './delivery-schema'
import type { Money } from './money'
import { BOOKABLE_COURIERS, TARIFFS_ARE_PLACEHOLDER } from './shipping'

/**
 * Where a delivery price comes from (AUDIT.md Q-22).
 *
 * The rate table in `shipping.ts` is a stand-in, and a made-up delivery charge
 * is a loss on every parcel in one direction and a customer overcharged in the
 * other. So the courier prices each parcel itself, from its own contracted
 * tariff, and this module is the one place that decides whether that number or
 * the table is used.
 *
 * Three outcomes, and the third is the point:
 *
 * - **`courier`** — the courier quoted this exact parcel. Used as-is.
 * - **`placeholder`** — nothing is configured to ask with, which is what a fresh
 *   clone is. The table stands in and the checkout says so visibly.
 * - **`unavailable`** — we *are* configured, we asked, and we did not get an
 *   answer we can trust. The order stops here.
 *
 * That last one is deliberate and it is the whole design. Once real rates are
 * available, quietly substituting a placeholder for one that failed would store
 * an order whose total nobody can honour — and it would look exactly like a
 * working checkout, so nobody would find out until the invoices arrived. A
 * customer who is asked to try again has lost thirty seconds; a customer charged
 * a number we invented has been misled, and we cannot fix it after the fact.
 */
export type RateResolution =
  | { source: 'courier'; rate: ShipmentRate }
  | { source: 'placeholder' }
  | { source: 'unavailable'; reason: string }

export interface RateRequest {
  delivery: DeliveryDetails
  /** Billable weight of the parcel, packaging included. See `billableWeight`. */
  weightGrams: number
  /**
   * The goods total — what the courier is asked to collect (наложен платеж).
   *
   * Goods only, not goods-plus-delivery, because the delivery charge is what we
   * are asking for and the request cannot contain its own answer. Econt's COD
   * fee scales with the amount collected, so the fee quoted here is a cent or
   * two below the one on the real waybill for the slightly larger sum. That is
   * invisible to the customer while the merchant absorbs the fee
   * (`COD_FEE_PAID_BY`); if that ever flips, quote twice rather than letting the
   * customer's total drift from the courier's invoice.
   */
  goods: Money
}

export async function resolveDeliveryRate({
  delivery,
  weightGrams,
  goods,
}: RateRequest): Promise<RateResolution> {
  if (!canQuoteLiveRates(delivery.courier)) return { source: 'placeholder' }

  const result = await courierClient(delivery.courier).priceShipment({
    method: delivery.method,
    // Only what a price depends on. No name, no phone — see
    // `ShipmentQuoteRequest`: the courier learns who the customer is when there
    // is a parcel to deliver, not while they are still deciding.
    ...(delivery.method === 'door'
      ? {
          address: {
            city: delivery.city,
            postCode: delivery.postCode,
            street: delivery.street,
          },
        }
      : { officeId: delivery.officeId }),
    weightGrams,
    codAmount: goods,
  })

  if (result.status === 'ok') return { source: 'courier', rate: result.data }

  if (result.status === 'unconfigured') {
    // `canQuoteLiveRates` said otherwise, so the two disagree — a variable that
    // changed between the check and the call, or a courier whose client has not
    // caught up. Falling back is right (there is nothing to be wrong about), but
    // it is worth knowing about.
    console.warn(
      `[rates] ${delivery.courier} reports itself unconfigured although it is set up to quote; ` +
        'falling back to the placeholder card'
    )
    return { source: 'placeholder' }
  }

  console.error(
    `[rates] ${delivery.courier} could not price a ${weightGrams}g parcel ` +
      `(${delivery.method}): ${result.reason}`
  )

  return { source: 'unavailable', reason: result.reason }
}

/**
 * Whether the checkout is still showing stand-in delivery prices.
 *
 * Every bookable courier has to be able to quote, because the customer chooses
 * after the page renders — one that cannot would leave the notice false for the
 * orders that matter most.
 */
export function deliveryRatesArePlaceholders(): boolean {
  return TARIFFS_ARE_PLACEHOLDER && !BOOKABLE_COURIERS.every(canQuoteLiveRates)
}
