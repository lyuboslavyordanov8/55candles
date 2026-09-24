import 'server-only'

import { and, eq, ne, sql } from 'drizzle-orm'

import { getDb } from '@/db'
import { orderEvents, orders } from '@/db/schema'
import { speedyFiscalReceipt } from './couriers'
import { isCourierBookable } from './shipping'
import { speedyContractReport, type SpeedyContractReport, type SpeedyParcel } from './speedy-contract'

/**
 * Every Speedy waybill the admin booked, read from the booking events.
 *
 * The booking event rather than the order row, because it is the one record of
 * *when* the waybill was issued and *what Speedy said it costs* — the order only
 * holds what the customer paid. A duplicate booking is logged under
 * `orphanedWaybill`, not `waybillNumber`, so it is not counted twice. Cancelled
 * orders are left out: their waybill is cancelled at Speedy and not billed.
 */
export async function speedyParcels(): Promise<SpeedyParcel[]> {
  const rows = await getDb()
    .select({
      bookedAt: orderEvents.createdAt,
      price: sql<string | null>`${orderEvents.detail}->>'courierPrice'`,
      status: orders.status,
    })
    .from(orderEvents)
    .innerJoin(orders, eq(orders.id, orderEvents.orderId))
    .where(
      and(
        eq(orders.courier, 'speedy'),
        ne(orders.status, 'cancelled'),
        sql`${orderEvents.detail}->>'source' = 'waybill'`,
        sql`${orderEvents.detail}->>'waybillNumber' is not null`
      )
    )

  return rows.map((row) => {
    const price = row.price === null ? NaN : Number(row.price)

    return {
      bookedAt: row.bookedAt,
      priceMinor: Number.isInteger(price) && price >= 0 ? price : null,
      status: row.status,
    }
  })
}

export async function loadSpeedyContractReport(now = new Date()): Promise<SpeedyContractReport> {
  return speedyContractReport({
    parcels: await speedyParcels(),
    now,
    fiscalReceiptOn: speedyFiscalReceipt() !== null,
    live: isCourierBookable('speedy'),
  })
}
