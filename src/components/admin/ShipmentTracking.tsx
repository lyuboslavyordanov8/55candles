import type { OrderStatus } from '@/db/schema'
import type { ShipmentTracking } from '@/lib/couriers/types'
import { formatMoney } from '@/lib/money'
import { STATUS_LABELS } from '@/lib/order-status'
import type { TrackingLookup } from '@/lib/tracking'
import { Badge, DetailRow, Notice, type Tone } from './ui'

/**
 * The courier's live view of a parcel, beside the order's own status.
 *
 * Server-rendered and read-only. Where the courier is ahead of the order — it
 * reports a delivery the order does not yet show — the panel says which status
 * to move to, and leaves the move to the buttons that already exist for it.
 */

const dateTime = new Intl.DateTimeFormat('bg-BG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Sofia',
})

const date = new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium', timeZone: 'Europe/Sofia' })

function when(iso: string): string {
  return dateTime.format(new Date(iso))
}

function toneOf(tracking: ShipmentTracking): Tone {
  if (tracking.followedBy) return 'warning'
  if (tracking.codPaid || tracking.deliveredAt) return 'success'
  return 'info'
}

/** The status the order should move to next, if the courier already shows it. */
function suggestion(tracking: ShipmentTracking, status: OrderStatus): OrderStatus | null {
  if (status === 'shipped' && tracking.deliveredAt) return 'delivered'
  if (status === 'delivered' && tracking.codCollected) return 'cod_collected'
  return null
}

/** Compact form for the orders table. */
export function TrackingBadge({ lookup }: { lookup: TrackingLookup | undefined }) {
  if (!lookup || lookup.state === 'unavailable') return <span className="text-ink-ghost">—</span>

  if (lookup.state === 'failed') {
    return <span className="text-ink-ghost" title={lookup.reason}>няма отговор</span>
  }

  if (lookup.state === 'missing') {
    return (
      <Badge tone="warning">
        <span title={lookup.reason}>неизвестна</span>
      </Badge>
    )
  }

  const { tracking } = lookup

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Badge tone={toneOf(tracking)}>{tracking.status}</Badge>
      {tracking.codPaid ? (
        <span className="text-[11px] text-emerald-800">НП преведен</span>
      ) : tracking.codCollected ? (
        <span className="text-[11px] text-amber-800">НП събран, чака превод</span>
      ) : null}
    </span>
  )
}

/** Full form for one order. */
export function TrackingPanel({
  lookup,
  orderStatus,
  courierLabel,
}: {
  lookup: TrackingLookup
  orderStatus: OrderStatus
  courierLabel: string
}) {
  if (lookup.state === 'unavailable') {
    return (
      <p className="text-xs text-ink-ghost">
        Проследяването за {courierLabel} още не е включено.
      </p>
    )
  }

  if (lookup.state === 'failed') {
    return (
      <p className="text-xs text-ink-secondary">
        {courierLabel} не отговори ({lookup.reason}). Презареди страницата след малко.
      </p>
    )
  }

  if (lookup.state === 'missing') {
    return (
      <Notice>
        {courierLabel} не намира тази товарителница: {lookup.reason}
      </Notice>
    )
  }

  const { tracking } = lookup
  const next = suggestion(tracking, orderStatus)

  return (
    <div className="space-y-3">
      <dl>
        <DetailRow label="Статус">
          <Badge tone={toneOf(tracking)}>{tracking.status}</Badge>
        </DetailRow>
        {tracking.deliveredAt ? (
          <DetailRow label="Доставена">{when(tracking.deliveredAt)}</DetailRow>
        ) : (
          tracking.expectedDeliveryDate && (
            <DetailRow label="Очаквана">
              {date.format(new Date(`${tracking.expectedDeliveryDate}T12:00:00Z`))}
            </DetailRow>
          )
        )}
        <DetailRow label="Наложен платеж">
          {tracking.codCollected ? (
            <>
              събран {formatMoney(tracking.codCollected.amount, 'bg')} на{' '}
              {when(tracking.codCollected.at)}
              <span className="block">
                {tracking.codPaid ? (
                  <span className="text-emerald-800">
                    преведен {formatMoney(tracking.codPaid.amount, 'bg')} на{' '}
                    {when(tracking.codPaid.at)}
                  </span>
                ) : (
                  <span className="text-amber-800">още не е преведен към фирмата</span>
                )}
              </span>
            </>
          ) : (
            <span className="text-ink-ghost">не е събран</span>
          )}
        </DetailRow>
        {tracking.followedBy && (
          <DetailRow label="Продължава като">
            <span className="tabular-nums">{tracking.followedBy}</span>
            <span className="block text-ink-ghost">
              нова товарителница от тази — обикновено връщане към подателя
            </span>
          </DetailRow>
        )}
      </dl>

      {next && (
        <Notice tone="info">
          {courierLabel} вече отчита това, а поръчката е „{STATUS_LABELS[orderStatus]}“. Смени
          статуса на „{STATUS_LABELS[next]}“ от бутоните по-долу.
        </Notice>
      )}

      {tracking.codPaid && orderStatus === 'cod_collected' && (
        <Notice tone="info">
          {courierLabel} отчита превод на парите. Щом ги видиш по сметката, премести поръчката на
          „{STATUS_LABELS.reconciled}“.
        </Notice>
      )}

      {tracking.events.length > 0 && (
        <ol className="space-y-1.5 border-t border-border/60 pt-3 text-xs">
          {tracking.events.map((event, index) => (
            <li key={`${event.at}-${index}`} className="flex gap-3">
              <span className="w-32 shrink-0 text-ink-ghost tabular-nums">{when(event.at)}</span>
              <span className={index === 0 ? 'text-ink-primary' : 'text-ink-secondary'}>
                {event.text}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
