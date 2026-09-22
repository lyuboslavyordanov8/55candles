import type { OrderStatus } from '@/db/schema'
import { STATUS_LABELS } from '@/lib/order-status'
import OrderStatusBadge from './OrderStatusBadge'

/**
 * Where this parcel is, on the line it actually travels.
 *
 * The one place in the admin that draws a sequence, because here the sequence is
 * real: a наложен платеж order moves through fixed states and the money arrives
 * at the *end*, after the goods are already gone. The rail is split in two for
 * exactly that reason —
 *
 *   Изпълнение: нова → потвърдена → опакована → изпратена → доставена
 *   Разплащане: парите са събрани → парите са получени
 *
 * — because "доставена" is where a card shop would be finished and this one is
 * owed its money. The schema refuses to call anything `paid` for the same reason
 * (`src/db/schema.ts`); the rail is that decision made visible to whoever is
 * looking at the order.
 *
 * An order that ended badly has no position on the line: `cancelled`,
 * `refused_at_delivery`, `returned` and the refunds are shown as the ending they
 * are, beside the last state the parcel did reach. Drawing them as step six of
 * seven would suggest they are on the way somewhere.
 */

const FULFILMENT: readonly OrderStatus[] = [
  'awaiting_cod',
  'confirmed',
  'packed',
  'shipped',
  'delivered',
] as const

const SETTLEMENT: readonly OrderStatus[] = ['cod_collected', 'reconciled'] as const

const PIPELINE: readonly OrderStatus[] = [...FULFILMENT, ...SETTLEMENT] as const

/** Shorter words for the rail: the badge carries the full label when it matters. */
const SHORT: Partial<Record<OrderStatus, string>> = {
  awaiting_cod: 'нова',
  cod_collected: 'парите събрани',
  reconciled: 'парите получени',
}

export default function OrderStatusRail({ status }: { status: OrderStatus }) {
  const position = PIPELINE.indexOf(status)
  const derailed = position === -1

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
      {PIPELINE.map((step, index) => {
        const done = !derailed && index < position
        const current = step === status
        const settlement = SETTLEMENT.includes(step)

        return (
          <div key={step} className="flex items-center gap-2">
            {settlement && index === FULFILMENT.length && (
              // The break in the line, and the only divider in the interface
              // that means something: everything right of it is money, not goods.
              <span
                aria-hidden="true"
                className="mr-1 h-5 w-px bg-border"
                title="След тази черта става въпрос за пари, не за стока"
              />
            )}

            <span
              aria-current={current ? 'step' : undefined}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors ${
                current
                  ? 'border-charcoal bg-charcoal font-medium text-cream-surface'
                  : done
                    ? 'border-border bg-cream-muted text-ink-secondary'
                    : 'border-dashed border-border bg-transparent text-ink-ghost'
              }`}
            >
              {done && <span aria-hidden="true">✓</span>}
              {SHORT[step] ?? STATUS_LABELS[step]}
            </span>
          </div>
        )
      })}

      {derailed && (
        <>
          <span aria-hidden="true" className="text-ink-ghost">
            →
          </span>
          <OrderStatusBadge status={status} />
        </>
      )}
    </div>
  )
}
