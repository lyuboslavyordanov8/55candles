import 'server-only'

import { courierClient } from './couriers'
import type { DeliveryDetails } from './delivery-schema'

export type OfficeResolution =
  | {
      /** Accepted: confirmed by the courier, taken on trust, or door delivery. */
      status: 'ok'
      snapshot?: { name: string; address: string }
      /**
       * True only when a courier confirmed the code. False when it was accepted
       * because the courier could not be reached or has no credentials — the
       * waybill step has to re-check those, so the distinction is recorded on the
       * order's creation event rather than being thrown away here.
       */
      verified: boolean
    }
  /** The courier answered, and has no office with that code. */
  | { status: 'unknown' }

/**
 * Re-check the chosen office server-side (AUDIT.md B-13 step 3).
 *
 * The picker showed a list that was correct when the page loaded. Offices close,
 * and a customer may be submitting a tab they opened yesterday — so the code is
 * checked again here, at the boundary, for the same reason prices are re-read
 * rather than trusted from the form.
 *
 * The two failure modes are treated differently on purpose:
 *
 * - **The courier answered and does not know the code** → reject. Accepting it
 *   produces a parcel with nowhere to go, discovered when the label is printed.
 * - **The courier could not be reached** → accept, keeping the customer's own
 *   value. A courier outage must not close the shop; the office is re-validated
 *   again before the waybill is created, which is the point where being wrong
 *   actually costs something.
 *
 * Also the moment the snapshot becomes trustworthy: on a successful lookup the
 * name and address are taken from the courier's record and the form's copies are
 * discarded.
 */
export async function resolveOffice(delivery: DeliveryDetails): Promise<OfficeResolution> {
  // Door delivery has no office to verify; `verified` is false because nothing
  // was, and no waybill step will look for one.
  if (delivery.method === 'door') return { status: 'ok', verified: false }

  const result = await courierClient(delivery.courier).findOffice(delivery.officeId)

  if (result.status === 'unconfigured') {
    // No credentials for this courier, so the customer typed the office into the
    // fallback field. There is nothing to check it against.
    return {
      status: 'ok',
      verified: false,
      snapshot: delivery.officeName
        ? { name: delivery.officeName, address: delivery.officeAddress }
        : undefined,
    }
  }

  if (result.status === 'failed') {
    console.error(
      `[checkout] Could not verify ${delivery.courier} office ${delivery.officeId}: ` +
        `${result.reason}. Accepting the order; re-verify before creating the waybill.`
    )
    return {
      status: 'ok',
      verified: false,
      snapshot: delivery.officeName
        ? { name: delivery.officeName, address: delivery.officeAddress }
        : undefined,
    }
  }

  if (!result.data) return { status: 'unknown' }

  return {
    status: 'ok',
    verified: true,
    snapshot: { name: result.data.name, address: result.data.address },
  }
}
