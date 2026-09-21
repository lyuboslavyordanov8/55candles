import Link from 'next/link'

import { requireAdmin } from '@/lib/admin-auth'
import { listOrders, countByStatus, PAGE_SIZE } from '@/lib/admin-orders'
import { isOrderStorageReady } from '@/lib/orders'
import { OPEN_STATUSES, STATUS_LABELS } from '@/lib/order-status'
import { orderStatus, type OrderStatus } from '@/db/schema'
import { formatMoney, money } from '@/lib/money'
import { isMailerConfigured, orderRecipient } from '@/lib/mailer'
import { COURIERS, type Courier } from '@/lib/shipping'

/**
 * The order list — the page the shop keeps open (AUDIT.md Phase 7).
 *
 * Defaults to the orders that need doing (`OPEN_STATUSES`), because the question
 * this page answers is "what do I have to pack today", not "how did the year go".
 * `?status=all` or `?status=<one>` widens it, `?q=` searches.
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

const COURIER_LABELS: Record<string, string> = { econt: 'Econt', speedy: 'Speedy' }
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
  }>
}) {
  await requireAdmin()

  if (!isOrderStorageReady()) {
    return (
      <p className="rounded-sm border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
        Няма настроена база данни (DATABASE_URL), така че няма и поръчки за показване.
      </p>
    )
  }

  const {
    status = 'open',
    q = '',
    page = '1',
    courier = '',
    dateFrom = '',
    dateTo = '',
  } = await searchParams
  const statuses = statusFilter(status)
  const courierValue = COURIERS.includes(courier as Courier) ? (courier as Courier) : undefined
  // A malformed date in the URL is dropped rather than sent to the database,
  // since a bare string here would otherwise reach a `new Date(...)` call one
  // module away with no chance to say which part of the URL was the problem.
  const dateFromValue = DATE_PATTERN.test(dateFrom) ? dateFrom : undefined
  const dateToValue = DATE_PATTERN.test(dateTo) ? dateTo : undefined

  const [list, counts] = await Promise.all([
    listOrders({
      statuses,
      query: q,
      page: Number(page) || 1,
      courier: courierValue,
      dateFrom: dateFromValue,
      dateTo: dateToValue,
    }),
    countByStatus(),
  ])

  const openCount = OPEN_STATUSES.reduce((sum, value) => sum + (counts[value] ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-medium">Поръчки</h1>
        <p className="text-xs text-stone-500">
          {list.total} {list.total === 1 ? 'поръчка' : 'поръчки'} по този филтър
        </p>
      </div>

      {!isMailerConfigured() && (
        // The shop is not being emailed about new orders, so this list is the only
        // place they appear — say so here rather than letting it be discovered.
        <p className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          Имейлите са изключени (липсва EMAIL_PROVIDER_API_KEY или EMAIL_FROM): новите
          поръчки се виждат само тук и клиентите не получават потвърждение.
        </p>
      )}

      {isMailerConfigured() && orderRecipient().length === 0 && (
        <p className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          Клиентите получават потвърждение, но ние не: задай ORDER_EMAIL_TO.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Chip href="/admin?status=open" active={status === 'open'}>
          за обработка ({openCount})
        </Chip>
        <Chip href="/admin?status=all" active={status === 'all'}>
          всички
        </Chip>
        {orderStatus.enumValues
          .filter((value) => (counts[value] ?? 0) > 0)
          .map((value) => (
            <Chip key={value} href={`/admin?status=${value}`} active={status === value}>
              {STATUS_LABELS[value]} ({counts[value]})
            </Chip>
          ))}
      </div>

      <form className="flex flex-wrap items-end gap-2" action="/admin">
        {/* Preserved, so searching does not silently drop the status filter. */}
        <input type="hidden" name="status" value={status} />

        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="номер, име, телефон или имейл"
          className="w-full max-w-sm rounded-sm border border-stone-300 px-3 py-1.5 text-xs"
        />

        <label className="text-xs">
          <span className="mb-1 block text-stone-500">Куриер</span>
          <select
            name="courier"
            defaultValue={courier}
            className="rounded-sm border border-stone-300 px-2 py-1.5"
          >
            <option value="">всички</option>
            {COURIERS.map((value) => (
              <option key={value} value={value}>
                {COURIER_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-stone-500">От дата</span>
          <input
            type="date"
            name="dateFrom"
            defaultValue={dateFrom}
            className="rounded-sm border border-stone-300 px-2 py-1.5"
          />
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-stone-500">До дата</span>
          <input
            type="date"
            name="dateTo"
            defaultValue={dateTo}
            className="rounded-sm border border-stone-300 px-2 py-1.5"
          />
        </label>

        <button
          type="submit"
          className="rounded-sm border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-100"
        >
          Търси
        </button>
      </form>

      {list.rows.length === 0 ? (
        <p className="rounded-sm border border-stone-200 bg-white p-4 text-xs text-stone-500">
          Няма поръчки по този филтър.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-stone-200 bg-white">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500">
                <th className="px-3 py-2 font-medium">Номер</th>
                <th className="px-3 py-2 font-medium">Дата</th>
                <th className="px-3 py-2 font-medium">Клиент</th>
                <th className="px-3 py-2 font-medium">Доставка</th>
                <th className="px-3 py-2 font-medium">Бр.</th>
                <th className="px-3 py-2 text-right font-medium">Сума</th>
                <th className="px-3 py-2 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((row) => (
                <tr key={row.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    <Link href={`/admin/orders/${row.id}`} className="underline-offset-2 hover:underline">
                      {row.orderNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-stone-500">
                    {dateFormat.format(row.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    {row.recipientName}
                    <span className="block text-stone-500">{row.phone}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.courier === 'econt' ? 'Econt' : 'Speedy'}{' '}
                    <span className="text-stone-500">
                      ({methodLabels[row.deliveryMethod] ?? row.deliveryMethod}, {row.city})
                    </span>
                  </td>
                  <td className="px-3 py-2">{row.itemCount}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {formatMoney(money(row.totalMinor), 'bg')}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{STATUS_LABELS[row.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.pageCount > 1 && (
        <nav className="flex items-center gap-3 text-xs">
          {list.page > 1 && (
            <Link href={pageHref({ status, q, courier, dateFrom, dateTo }, list.page - 1)} className="underline">
              ← по-нови
            </Link>
          )}
          <span className="text-stone-500">
            страница {list.page} от {list.pageCount} · по {PAGE_SIZE}
          </span>
          {list.page < list.pageCount && (
            <Link href={pageHref({ status, q, courier, dateFrom, dateTo }, list.page + 1)} className="underline">
              по-стари →
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}

/**
 * Which statuses the `?status=` parameter means.
 *
 * `all` and anything unrecognised mean no filter — a mistyped status shows
 * everything rather than an empty table that looks like lost orders.
 */
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

function statusFilter(value: string): readonly OrderStatus[] | undefined {
  if (value === 'open') return OPEN_STATUSES
  if ((orderStatus.enumValues as readonly string[]).includes(value)) {
    return [value as OrderStatus]
  }
  return undefined
}

function Chip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? 'border-stone-900 bg-stone-900 text-white'
          : 'border-stone-300 text-stone-600 hover:bg-stone-100'
      }`}
    >
      {children}
    </Link>
  )
}
