import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireAdmin } from '@/lib/admin-auth'
import { getOrderDetail } from '@/lib/admin-orders'
import { nextStatuses, STATUS_LABELS } from '@/lib/order-status'
import { formatMoney, money } from '@/lib/money'
import { changeStatus } from '../../actions'

/**
 * One order: everything needed to pack it, ship it and settle it.
 *
 * The three blocks are in the order they are used — what to put in the box, where
 * it goes and who to call, then what has happened to it so far. The status form is
 * the only thing on the page that writes, and it can only offer moves the graph in
 * `src/lib/order-status.ts` allows.
 */

const dateFormat = new Intl.DateTimeFormat('bg-BG', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const methodLabels: Record<string, string> = {
  door: 'до адрес',
  office: 'до офис',
  locker: 'до автомат',
}

const notices: Record<string, string> = {
  stale: 'Поръчката вече е в друг статус — някой я е преместил. Виж историята по-долу.',
}

export default async function AdminOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; changed?: string }>
}) {
  await requireAdmin()

  const { id } = await params
  const detail = await getOrderDetail(id)
  if (!detail) notFound()

  const { order, items, events } = detail
  const { error, changed } = await searchParams

  const currency = order.currency as 'EUR'
  const amount = (minor: number) => formatMoney(money(minor, currency), 'bg')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link href="/admin" className="text-xs text-stone-500 underline">
            ← всички поръчки
          </Link>
          <h1 className="text-lg font-medium">{order.orderNumber}</h1>
          <p className="text-xs text-stone-500">
            {dateFormat.format(order.createdAt)} · {STATUS_LABELS[order.status]}
          </p>
        </div>
        <p className="text-right">
          <span className="block text-xs text-stone-500">наложен платеж</span>
          <span className="text-lg">{amount(order.totalMinor)}</span>
        </p>
      </div>

      {error && notices[error] && (
        <p role="alert" className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {notices[error]}
        </p>
      )}

      {changed && STATUS_LABELS[changed as keyof typeof STATUS_LABELS] && (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          Статусът е сменен на „{STATUS_LABELS[changed as keyof typeof STATUS_LABELS]}“.
        </p>
      )}

      <section className="rounded-sm border border-stone-200 bg-white">
        <h2 className="border-b border-stone-200 px-4 py-2 text-xs font-medium tracking-wide text-stone-500 uppercase">
          За опаковане
        </h2>
        <table className="w-full border-collapse text-xs">
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-stone-100">
                <td className="px-4 py-2">
                  {item.name}
                  <span className="block text-stone-400">{item.productSlug}</span>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{item.quantity} бр.</td>
                <td className="px-4 py-2 whitespace-nowrap text-stone-500">
                  {amount(item.unitPriceMinor)} / бр.
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {amount(item.lineTotalMinor)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-stone-600">
            <Money label="Стоки" value={amount(order.goodsMinor)} />
            {order.discountMinor > 0 && (
              <Money
                label={`Отстъпка${order.promoCode ? ` (${order.promoCode})` : ''}`}
                value={`−${amount(order.discountMinor)}`}
              />
            )}
            <Money
              label={order.shippingMinor === 0 ? 'Доставка (безплатна)' : 'Доставка'}
              value={amount(order.shippingMinor)}
            />
            {order.codFeeMinor !== null && (
              <Money label="Такса наложен платеж" value={amount(order.codFeeMinor)} />
            )}
            <Money label="Общо" value={amount(order.totalMinor)} strong />
            <tr>
              <td colSpan={3} className="px-4 py-2 text-stone-400">
                Тегло на пратката
              </td>
              <td className="px-4 py-2 text-right text-stone-400">{order.weightGrams} г</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-sm border border-stone-200 bg-white p-4">
          <h2 className="mb-2 text-xs font-medium tracking-wide text-stone-500 uppercase">
            Доставка
          </h2>
          <dl className="space-y-1 text-xs">
            <Row label="Куриер">
              {order.courier === 'econt' ? 'Econt' : 'Speedy'} ·{' '}
              {methodLabels[order.deliveryMethod] ?? order.deliveryMethod}
            </Row>
            {order.deliveryMethod === 'door' ? (
              <Row label="Адрес">
                {order.street}, {order.postCode} {order.city}
              </Row>
            ) : (
              <Row label="Офис">
                {order.officeName || '—'}
                {order.officeAddress ? `, ${order.officeAddress}` : ''}
                <span className="block text-stone-400">
                  код {order.officeId || '—'} · {order.postCode} {order.city}
                </span>
              </Row>
            )}
            {order.note && <Row label="Бележка">{order.note}</Row>}
            <Row label="Товарителница">{order.waybillNumber || '—'}</Row>
          </dl>
        </section>

        <section className="rounded-sm border border-stone-200 bg-white p-4">
          <h2 className="mb-2 text-xs font-medium tracking-wide text-stone-500 uppercase">
            Клиент
          </h2>
          <dl className="space-y-1 text-xs">
            <Row label="Име">{order.recipientName}</Row>
            <Row label="Телефон">
              <a href={`tel:${order.phone}`} className="underline">
                {order.phone}
              </a>
            </Row>
            <Row label="Имейл">
              {order.email ? (
                <a href={`mailto:${order.email}`} className="underline">
                  {order.email}
                </a>
              ) : (
                '— (без имейл, потвърждение не е изпратено)'
              )}
            </Row>
          </dl>
        </section>
      </div>

      <section className="rounded-sm border border-stone-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-medium tracking-wide text-stone-500 uppercase">
          Следваща стъпка
        </h2>

        {nextStatuses(order.status).length === 0 ? (
          <p className="text-xs text-stone-500">
            Поръчката е приключена — няма следващ статус.
          </p>
        ) : (
          <form action={changeStatus} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="orderId" value={order.id} />
            {/*
              What the page was rendered against. Enforced server-side, so two
              people working the same order cannot both advance it from a status
              only one of them saw.
            */}
            <input type="hidden" name="expectedFrom" value={order.status} />

            <label className="text-xs">
              <span className="mb-1 block text-stone-500">Нов статус</span>
              <select
                name="to"
                required
                defaultValue={nextStatuses(order.status)[0]}
                className="rounded-sm border border-stone-300 px-2 py-1.5"
              >
                {nextStatuses(order.status).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs">
              <span className="mb-1 block text-stone-500">Товарителница (при изпращане)</span>
              <input
                name="waybillNumber"
                defaultValue={order.waybillNumber ?? ''}
                className="rounded-sm border border-stone-300 px-2 py-1.5"
              />
            </label>

            <label className="grow text-xs">
              <span className="mb-1 block text-stone-500">Бележка (влиза в историята)</span>
              <input name="note" className="w-full rounded-sm border border-stone-300 px-2 py-1.5" />
            </label>

            <button
              type="submit"
              className="rounded-sm bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700"
            >
              Запиши
            </button>
          </form>
        )}
      </section>

      <section className="rounded-sm border border-stone-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-medium tracking-wide text-stone-500 uppercase">
          История
        </h2>
        <ol className="space-y-2 text-xs">
          {events.map((event) => (
            <li key={event.id} className="flex flex-wrap gap-x-3 border-b border-stone-100 pb-2 last:border-0">
              <span className="text-stone-400">{dateFormat.format(event.createdAt)}</span>
              <span>
                {event.fromStatus ? `${STATUS_LABELS[event.fromStatus]} → ` : ''}
                {STATUS_LABELS[event.toStatus]}
              </span>
              <span className="text-stone-400">{event.actor}</span>
              {formatDetail(event.detail) ? (
                <code className="w-full text-stone-400">{formatDetail(event.detail)}</code>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

/**
 * The event's `detail` jsonb as one readable line, or `''` when there is nothing.
 *
 * Typed `unknown` by the schema, because the column holds whatever the code that
 * wrote the event thought was worth recording — so it is read defensively here
 * rather than cast to a shape this page hopes it has.
 */
function formatDetail(detail: unknown): string {
  if (!detail || typeof detail !== 'object') return ''

  const entries = Object.entries(detail as Record<string, unknown>).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  )

  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(' · ')
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-stone-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Money({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <tr className={strong ? 'font-medium text-stone-900' : undefined}>
      <td colSpan={3} className="px-4 py-1">
        {label}
      </td>
      <td className="px-4 py-1 text-right whitespace-nowrap">{value}</td>
    </tr>
  )
}
