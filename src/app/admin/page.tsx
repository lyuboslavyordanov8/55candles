import Link from 'next/link'

import { requireAdmin } from '@/lib/admin-auth'
import { listOrders, countByStatus, PAGE_SIZE } from '@/lib/admin-orders'
import { isOrderStorageReady } from '@/lib/orders'
import { OPEN_STATUSES, STATUS_LABELS } from '@/lib/order-status'
import { orderStatus, type OrderStatus } from '@/db/schema'
import { formatMoney, money } from '@/lib/money'
import { isMailerConfigured, orderRecipient } from '@/lib/mailer'
import { COURIER_LABELS, COURIERS, type Courier } from '@/lib/shipping'
import OrderStatusBadge from '@/components/admin/OrderStatusBadge'
import { TrackingBadge } from '@/components/admin/ShipmentTracking'
import { trackOrders } from '@/lib/tracking'
import { bannerChecks } from '@/lib/speedy-contract'
import { loadSpeedyContractReport } from '@/lib/speedy-contract-data'
import {
  button,
  EmptyState,
  fieldLabel,
  input,
  Notice,
  PageHeader,
  panel,
  select,
  table,
  tableWrap,
  td,
  th,
  tr,
} from '@/components/admin/ui'

/**
 * The order list — the page the shop keeps open (AUDIT.md Phase 7).
 *
 * Defaults to the orders that need doing (`OPEN_STATUSES`), because the question
 * this page answers is "what do I have to pack today", not "how did the year go".
 * `?status=all` or `?status=<one>` widens it, `?q=` searches.
 *
 * The filters are a plain `GET` form and the pagination is plain links, so the
 * whole state of this page is its URL: reloadable, shareable, and back-button
 * safe without a line of script.
 */

const dateFormat = new Intl.DateTimeFormat('bg-BG', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const methodLabels: Record<string, string> = {
  door: 'адрес',
  office: 'офис',
  locker: 'автомат',
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    q?: string
    page?: string
    courier?: string
    dateFrom?: string
    dateTo?: string
    deleted?: string
  }>
}) {
  await requireAdmin()

  if (!isOrderStorageReady()) {
    return (
      <Notice>
        Няма настроена база данни (DATABASE_URL), така че няма и поръчки за показване.
      </Notice>
    )
  }

  const {
    status = 'open',
    q = '',
    page = '1',
    courier = '',
    dateFrom = '',
    dateTo = '',
    deleted = '',
  } = await searchParams
  const statuses = statusFilter(status)
  const courierValue = COURIERS.includes(courier as Courier) ? (courier as Courier) : undefined
  // A malformed date in the URL is dropped rather than sent to the database,
  // since a bare string here would otherwise reach a `new Date(...)` call one
  // module away with no chance to say which part of the URL was the problem.
  const dateFromValue = DATE_PATTERN.test(dateFrom) ? dateFrom : undefined
  const dateToValue = DATE_PATTERN.test(dateTo) ? dateTo : undefined

  const [list, counts, speedy] = await Promise.all([
    listOrders({
      statuses,
      query: q,
      page: Number(page) || 1,
      courier: courierValue,
      dateFrom: dateFromValue,
      dateTo: dateToValue,
    }),
    countByStatus(),
    loadSpeedyContractReport(),
  ])
  const speedyAlerts = bannerChecks(speedy)

  // One request per courier for the whole page, after the list — it needs the
  // waybill numbers, and a slow courier costs the table its last column only.
  const tracking = await trackOrders(list.rows)

  const openCount = OPEN_STATUSES.reduce((sum, value) => sum + (counts[value] ?? 0), 0)
  const narrowed = Boolean(q || courier || dateFrom || dateTo)

  return (
    <>
      <PageHeader
        title="Поръчки"
        description={
          <>
            {list.total} {list.total === 1 ? 'поръчка' : 'поръчки'} по този филтър
            {narrowed && ' · филтърът е стеснен'}
          </>
        }
      />

      {deleted && <Notice tone="success">Поръчка {deleted} е изтрита.</Notice>}

      {!isMailerConfigured() && (
        // The shop is not being emailed about new orders, so this list is the only
        // place they appear — say so here rather than letting it be discovered.
        <Notice>
          Имейлите са изключени (липсва EMAIL_PROVIDER_API_KEY или EMAIL_FROM): новите
          поръчки се виждат само тук и клиентите не получават потвърждение.
        </Notice>
      )}

      {isMailerConfigured() && orderRecipient().length === 0 && (
        <Notice>Клиентите получават потвърждение, но ние не: задай ORDER_EMAIL_TO.</Notice>
      )}

      {speedyAlerts.length > 0 && (
        <Notice tone={speedy.worst === 'danger' ? 'danger' : 'warning'}>
          Договор Speedy: {speedyAlerts.map((check) => check.title.toLowerCase()).join(', ')}.{' '}
          <Link href="/admin/speedy" className="font-medium underline underline-offset-2">
            Виж какво да направиш
          </Link>
        </Notice>
      )}

      <div className="-mx-1 flex flex-wrap items-center gap-1.5 px-1">
        <Chip href="/admin?status=open" active={status === 'open'} count={openCount}>
          За обработка
        </Chip>
        <Chip href="/admin?status=all" active={status === 'all'}>
          Всички
        </Chip>
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
        {orderStatus.enumValues
          .filter((value) => (counts[value] ?? 0) > 0)
          .map((value) => (
            <Chip
              key={value}
              href={`/admin?status=${value}`}
              active={status === value}
              count={counts[value]}
            >
              {STATUS_LABELS[value]}
            </Chip>
          ))}
      </div>

      <form className={`${panel} flex flex-wrap items-end gap-3 p-3`} action="/admin">
        {/* Preserved, so searching does not silently drop the status filter. */}
        <input type="hidden" name="status" value={status} />

        <label className="min-w-0 flex-1 basis-64">
          <span className={fieldLabel}>Търсене</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="номер, име, телефон или имейл"
            className={input}
          />
        </label>

        <label className="basis-32">
          <span className={fieldLabel}>Куриер</span>
          <select name="courier" defaultValue={courier} className={select}>
            <option value="">всички</option>
            {COURIERS.map((value) => (
              <option key={value} value={value}>
                {COURIER_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="basis-36">
          <span className={fieldLabel}>От дата</span>
          <input type="date" name="dateFrom" defaultValue={dateFrom} className={input} />
        </label>

        <label className="basis-36">
          <span className={fieldLabel}>До дата</span>
          <input type="date" name="dateTo" defaultValue={dateTo} className={input} />
        </label>

        <div className="flex items-center gap-2">
          <button type="submit" className={button('primary')}>
            Търси
          </button>
          {narrowed && (
            <Link href={`/admin?status=${status}`} className={button('ghost')}>
              Изчисти
            </Link>
          )}
        </div>
      </form>

      {list.rows.length === 0 ? (
        <EmptyState
          title="Няма поръчки по този филтър"
          description={
            narrowed
              ? 'Разшири търсенето или изчисти филтрите, за да видиш останалите поръчки.'
              : 'Щом влезе поръчка, тя се появява тук — и в имейла, ако е настроен.'
          }
          action={
            narrowed ? (
              <Link href={`/admin?status=${status}`} className={button('secondary')}>
                Изчисти филтрите
              </Link>
            ) : (
              <Link href="/admin?status=all" className={button('secondary')}>
                Покажи всички статуси
              </Link>
            )
          }
        />
      ) : (
        <div className={`${tableWrap} overflow-x-auto`}>
          <table className={table}>
            <thead className="bg-cream-surface/60">
              <tr>
                <th className={th}>Номер</th>
                <th className={th}>Дата</th>
                <th className={th}>Клиент</th>
                <th className={th}>Доставка</th>
                <th className={`${th} text-right`}>Бр.</th>
                <th className={`${th} text-right`}>Сума</th>
                <th className={th}>Статус</th>
                <th className={th}>При куриера</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((row) => (
                <tr key={row.id} className={tr}>
                  <td className={`${td} whitespace-nowrap`}>
                    <Link
                      href={`/admin/orders/${row.id}`}
                      className="font-medium tabular-nums underline-offset-2 hover:underline"
                    >
                      {row.orderNumber}
                    </Link>
                  </td>
                  <td className={`${td} whitespace-nowrap text-ink-ghost tabular-nums`}>
                    {dateFormat.format(row.createdAt)}
                  </td>
                  <td className={td}>
                    <span className="block truncate">{row.recipientName}</span>
                    <span className="block text-ink-ghost tabular-nums">{row.phone}</span>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {COURIER_LABELS[row.courier]}
                    <span className="block text-ink-ghost">
                      {methodLabels[row.deliveryMethod] ?? row.deliveryMethod}, {row.city}
                    </span>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{row.itemCount}</td>
                  <td className={`${td} text-right font-medium whitespace-nowrap tabular-nums`}>
                    {formatMoney(money(row.totalMinor), 'bg')}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <OrderStatusBadge status={row.status} />
                  </td>
                  <td className={td}>
                    {row.waybillNumber ? (
                      <TrackingBadge lookup={tracking.get(row.waybillNumber.trim())} />
                    ) : (
                      <span className="text-ink-ghost">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.pageCount > 1 && (
        <nav className="flex items-center justify-between gap-3 text-xs" aria-label="Страници">
          {list.page > 1 ? (
            <Link
              href={pageHref({ status, q, courier, dateFrom, dateTo }, list.page - 1)}
              className={button('secondary')}
            >
              ← по-нови
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-ghost tabular-nums">
            страница {list.page} от {list.pageCount} · по {PAGE_SIZE}
          </span>
          {list.page < list.pageCount ? (
            <Link
              href={pageHref({ status, q, courier, dateFrom, dateTo }, list.page + 1)}
              className={button('secondary')}
            >
              по-стари →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  )
}

/**
 * A pagination link that keeps every other filter — without this, going to
 * page 2 would silently drop the courier or date range the admin had just set.
 */
function pageHref(
  filters: { status: string; q: string; courier: string; dateFrom: string; dateTo: string },
  page: number
): string {
  const params = new URLSearchParams({ status: filters.status, page: String(page) })
  if (filters.q) params.set('q', filters.q)
  if (filters.courier) params.set('courier', filters.courier)
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.set('dateTo', filters.dateTo)
  return `/admin?${params.toString()}`
}

/**
 * Which statuses the `?status=` parameter means.
 *
 * `all` and anything unrecognised mean no filter — a mistyped status shows
 * everything rather than an empty table that looks like lost orders.
 */
function statusFilter(value: string): readonly OrderStatus[] | undefined {
  if (value === 'open') return OPEN_STATUSES
  if ((orderStatus.enumValues as readonly string[]).includes(value)) {
    return [value as OrderStatus]
  }
  return undefined
}

/**
 * One status filter.
 *
 * The count is part of the control rather than a separate badge: "за обработка"
 * and the number of them is one fact, and splitting it in two invites the eye to
 * read the number as a quantity of something else.
 */
function Chip({
  href,
  active,
  count,
  children,
}: {
  href: string
  active: boolean
  count?: number
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? 'border-charcoal bg-charcoal text-cream-surface'
          : 'border-border bg-paper-white text-ink-secondary hover:border-clay/40 hover:text-ink-primary'
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={`tabular-nums ${active ? 'text-cream-muted/70' : 'text-ink-ghost'}`}>
          {count}
        </span>
      )}
    </Link>
  )
}
