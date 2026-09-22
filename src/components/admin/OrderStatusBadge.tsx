import type { OrderStatus } from '@/db/schema'
import { STATUS_LABELS } from '@/lib/order-status'
import { Badge, type Tone } from './ui'

/**
 * One order status, coloured by what it means for the shop.
 *
 * The tones encode the two things an admin scanning a list actually wants to
 * know — *does this need me today* and *did the money arrive* — rather than
 * position in the pipeline:
 *
 * - **warning** for the states that are waiting on a human here: a new order
 *   nobody has looked at, and one confirmed but not yet packed.
 * - **info** for a parcel in motion, where nothing is owed and nothing is due.
 * - **success** only once the money is in, which in a наложен платеж shop is
 *   `reconciled` and nothing earlier. `delivered` is *not* success: the goods
 *   are gone and the cash is still with the courier. That distinction is the
 *   one the whole status graph exists to keep (`src/db/schema.ts`), so the
 *   colours had better not blur it.
 * - **danger** for a sale that came undone.
 *
 * The label always comes from `STATUS_LABELS`, so the badge cannot drift from
 * the word the rest of the admin uses.
 */
const TONE_BY_STATUS: Readonly<Record<OrderStatus, Tone>> = {
  draft: 'neutral',
  awaiting_cod: 'warning',
  confirmed: 'warning',
  packed: 'warning',
  shipped: 'info',
  delivered: 'info',
  cod_collected: 'info',
  reconciled: 'success',
  refused_at_delivery: 'danger',
  returned: 'danger',
  cancelled: 'danger',
  refunded: 'danger',
  partially_refunded: 'danger',
}

export default function OrderStatusBadge({
  status,
  className = '',
}: {
  status: OrderStatus
  className?: string
}) {
  return (
    <Badge tone={TONE_BY_STATUS[status]} className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
