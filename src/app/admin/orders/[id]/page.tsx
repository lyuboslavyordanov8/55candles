import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireAdmin } from '@/lib/admin-auth'
import { getOrderDetail, refusalHistory, undoEligibility, UNDO_WINDOW_MS } from '@/lib/admin-orders'
import { nextStatuses, STATUS_LABELS, statusRequiresReason } from '@/lib/order-status'
import { formatMoney, money } from '@/lib/money'
import { defaultBuyerFor, getInvoiceForOrder, invoiceBlocker } from '@/lib/invoices'
import { waybillBlocker } from '@/lib/waybills'
import type { OrderEvent } from '@/db/schema'
import CopyButton from '@/components/admin/CopyButton'
import ConfirmSubmit from '@/components/admin/ConfirmSubmit'
import { addNote, changeStatus, issueInvoice, issueWaybill, undoStatusChange } from '../../actions'

/**
 * One order: everything needed to pack it, ship it and settle it.
 *
 * The blocks are in the order they are used — what to put in the box, where it
 * goes and who to call, then what can be done to it now, then what has happened
 * so far. Status moves are single-click buttons, one per status the order may go
 * to next (`src/lib/order-status.ts` decides which), with a short Undo window
 * rather than a dropdown-and-save: see `undoEligibility`. `refused_at_delivery`
 * and `returned` are the one exception — both require a reason, so both need a
 * field before they can be a click.
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
  reason_required: 'Тази стъпка изисква причина — попълни полето и опитай пак.',
  waybill_failed:
    'Econt не издаде товарителница. Точната причина е записана в историята по-долу.',
  waybill_busy: 'Товарителницата за тази поръчка се издава в момента. Изчакай и презареди.',
  waybill_blocked: 'Товарителница не може да се издаде за тази поръчка — виж по-долу защо.',
  waybill_confirm: 'Номерът на поръчката не съвпада — товарителница не е издадена.',
  invoice_buyer: 'Фактурата не беше издадена: липсва име на получателя.',
  invoice_blocked: 'Фактура не може да се издаде за тази поръчка — виж по-долу защо.',
  invoice_confirm: 'Номерът на поръчката не съвпада — фактура не е издадена.',
  invoice_failed:
    'Фактурата не беше издадена и номер не е изразходван. Опитай отново; ако пак не стане, провери логовете.',
  undo_tooLate: 'Твърде късно е за отмяна — прозорецът от 2 минути е изтекъл.',
  undo_notLastTransition:
    'Няма какво да се отмени — статусът се е променил отново след последната стъпка.',
  note_empty: 'Бележката е празна — нищо не е записано.',
}

/**
 * The label PDF from the order's history, newest first.
 *
 * Kept in the event's `detail` rather than in a column: it is one link per booking
 * and the history is already where a booking is recorded, so a column would be a
 * migration to store a duplicate of something we have.
 */
function labelPdfUrl(events: readonly OrderEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const detail = events[i].detail

    if (detail && typeof detail === 'object') {
      const url = (detail as Record<string, unknown>).waybillPdfUrl
      if (typeof url === 'string' && url.startsWith('https://')) return url
    }
  }

  return null
}

/** One address, as one string, for the copy button — shaped for pasting into the courier's own system. */
function addressForCopy(order: {
  deliveryMethod: string
  recipientName: string
  phone: string
  street: string
  city: string
  postCode: string
  officeName: string
  officeAddress: string
  officeId: string
}): string {
  const lines = [`${order.recipientName}, ${order.phone}`]

  if (order.deliveryMethod === 'door') {
    lines.push(order.street, `${order.postCode} ${order.city}`)
  } else {
    lines.push(
      `${order.officeName || 'офис ' + order.officeId} (код ${order.officeId})`,
      order.officeAddress,
      `${order.postCode} ${order.city}`
    )
  }

  return lines.filter(Boolean).join('\n')
}

export default async function AdminOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    error?: string
    changed?: string
    reverted?: string
    noted?: string
    waybill?: string
    invoice?: string
  }>
}) {
  await requireAdmin()

  const { id } = await params
  const detail = await getOrderDetail(id)
  if (!detail) notFound()

  const { order, items, events } = detail
  const { error, changed, reverted, noted, waybill, invoice } = await searchParams

  const currency = order.currency as 'EUR'
  const amount = (minor: number) => formatMoney(money(minor, currency), 'bg')
  const blocker = waybillBlocker(order)
  const pdfUrl = labelPdfUrl(events)
  const undo = undoEligibility(events, order.status)
  const refusals = await refusalHistory(order.phone, order.id)

  const issued = await getInvoiceForOrder(order.id)
  const invoiceStop = invoiceBlocker(order, issued)
  const buyer = defaultBuyerFor(order)

  const upcoming = nextStatuses(order.status)
  const normalNext = upcoming.filter((status) => !statusRequiresReason(status))
  const reasonNext = upcoming.filter(statusRequiresReason)

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

      {refusals.length > 0 && (
        <p role="alert" className="rounded-sm border border-red-300 bg-red-50 p-3 text-xs text-red-900">
          Този телефон има {refusals.length}{' '}
          {refusals.length === 1 ? 'предишна отказана/върната поръчка' : 'предишни отказани/върнати поръчки'}:{' '}
          {refusals.map((row, index) => (
            <span key={row.id}>
              {index > 0 && ', '}
              <Link href={`/admin/orders/${row.id}`} className="underline">
                {row.orderNumber}
              </Link>
            </span>
          ))}
          . Провери преди да подадеш отново.
        </p>
      )}

      {error && notices[error] && (
        <p role="alert" className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {notices[error]}
        </p>
      )}

      {waybill && (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          Товарителница {waybill} е издадена. Разпечатай етикета и подай пратката на Econt.
        </p>
      )}

      {invoice && (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          Фактура № {invoice} е издадена.{' '}
          <Link href={`/admin/orders/${order.id}/invoice`} className="underline">
            Отвори за печат
          </Link>
          .
        </p>
      )}

      {noted && (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          Бележката е записана.
        </p>
      )}

      {changed && STATUS_LABELS[changed as keyof typeof STATUS_LABELS] && (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          Статусът е сменен на „{STATUS_LABELS[changed as keyof typeof STATUS_LABELS]}“.
        </p>
      )}

      {reverted && STATUS_LABELS[reverted as keyof typeof STATUS_LABELS] && (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          Отменено — статусът е върнат на „{STATUS_LABELS[reverted as keyof typeof STATUS_LABELS]}“.
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
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium tracking-wide text-stone-500 uppercase">
              Доставка
            </h2>
            <CopyButton text={addressForCopy(order)} label="Копирай адреса" />
          </div>
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
            <Row label="Товарителница">
              {order.waybillNumber ? (
                order.trackingUrl ? (
                  <a
                    href={order.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {order.waybillNumber}
                  </a>
                ) : (
                  order.waybillNumber
                )
              ) : (
                '—'
              )}
            </Row>
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
          Товарителница
        </h2>

        {order.waybillNumber ? (
          <p className="text-xs text-stone-600">
            Издадена: <span className="font-medium">{order.waybillNumber}</span>
            {pdfUrl && (
              <>
                {' · '}
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  етикет (PDF)
                </a>
              </>
            )}
            {order.trackingUrl && (
              <>
                {' · '}
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  проследяване
                </a>
              </>
            )}
            <span className="mt-1 block text-stone-400">
              Втора товарителница за същата поръчка не се издава оттук. Ако тази е грешна, отмени я
              в my.econt.com.
            </span>
          </p>
        ) : blocker ? (
          <p className="text-xs text-stone-500">{blockerText(blocker)}</p>
        ) : (
          <form action={issueWaybill} className="space-y-2">
            <input type="hidden" name="orderId" value={order.id} />
            <p className="text-xs text-stone-600">
              Econt ще издаде истинска товарителница —{' '}
              {order.deliveryMethod === 'door'
                ? `до адрес: ${order.street}, ${order.postCode} ${order.city}`
                : `до ${methodLabels[order.deliveryMethod] ?? order.deliveryMethod} ${order.officeName} (код ${order.officeId})`}
              , {order.weightGrams} г, наложен платеж {amount(order.totalMinor)}.
            </p>
            <ConfirmSubmit expected={order.orderNumber} buttonLabel="Издай товарителница" />
          </form>
        )}
      </section>

      <section className="rounded-sm border border-stone-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-medium tracking-wide text-stone-500 uppercase">
          Фактура
        </h2>

        {issued ? (
          <p className="text-xs text-stone-600">
            Издадена: <span className="font-medium">№ {issued.number}</span> ·{' '}
            {dateFormat.format(issued.issuedAt)} ·{' '}
            <Link href={`/admin/orders/${order.id}/invoice`} className="underline">
              за печат
            </Link>
            <span className="mt-1 block text-stone-400">
              Фактурата не се редактира и не се изтрива — номерът вече е част от редовна поредица.
              Грешка се коригира с кредитно известие, което се прави ръчно.
            </span>
          </p>
        ) : invoiceStop ? (
          <p className="text-xs text-stone-500">{invoiceBlockerText(invoiceStop)}</p>
        ) : (
          <form action={issueInvoice} className="space-y-3">
            <input type="hidden" name="orderId" value={order.id} />
            <p className="text-xs text-stone-600">
              Фактура на {amount(order.totalMinor)} без ДДС (дружеството не е регистрирано по ЗДДС).
              По подразбиране на физическото лице от поръчката — попълни полетата само ако клиентът
              иска фактура на фирма.
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              <Field name="buyerName" label="Получател" defaultValue={buyer.name} required />
              <Field name="buyerAddress" label="Адрес" defaultValue={buyer.address ?? ''} />
              <Field name="buyerCompany" label="Фирма (ако е на фирма)" />
              <Field name="buyerEik" label="ЕИК / Булстат" />
              <Field name="buyerVatNumber" label="ДДС № (ако има)" />
              <Field name="buyerAccountable" label="МОЛ" />
            </div>

            <ConfirmSubmit expected={order.orderNumber} buttonLabel="Издай фактура" />
          </form>
        )}
      </section>

      <section className="rounded-sm border border-stone-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-medium tracking-wide text-stone-500 uppercase">
          Следваща стъпка
        </h2>

        {undo.eligible && (
          <form action={undoStatusChange} className="mb-3 flex items-center gap-2 rounded-sm border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            <input type="hidden" name="orderId" value={order.id} />
            <span>
              Последна промяна преди {Math.round((Date.now() - undo.event.createdAt.getTime()) / 1000)} сек.
            </span>
            <button
              type="submit"
              className="rounded-sm border border-amber-400 bg-white px-2 py-1 font-medium hover:bg-amber-100"
            >
              Отмени (до {Math.round(UNDO_WINDOW_MS / 60_000)} мин.)
            </button>
          </form>
        )}

        {upcoming.length === 0 ? (
          <p className="text-xs text-stone-500">Поръчката е приключена — няма следващ статус.</p>
        ) : (
          <div className="space-y-3">
            {normalNext.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {normalNext.map((status) => (
                  <form key={status} action={changeStatus}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="expectedFrom" value={order.status} />
                    <input type="hidden" name="to" value={status} />
                    {status === 'shipped' && (
                      <input
                        type="hidden"
                        name="waybillNumber"
                        value={order.waybillNumber ?? ''}
                      />
                    )}
                    <button
                      type="submit"
                      className="rounded-sm bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700"
                    >
                      → {STATUS_LABELS[status]}
                    </button>
                  </form>
                ))}
              </div>
            )}

            {reasonNext.map((status) => (
              <form
                key={status}
                action={changeStatus}
                className="flex flex-wrap items-end gap-2 rounded-sm border border-stone-200 p-3"
              >
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="expectedFrom" value={order.status} />
                <input type="hidden" name="to" value={status} />
                <label className="grow text-xs">
                  <span className="mb-1 block text-stone-500">
                    Причина (задължително за „{STATUS_LABELS[status]}“)
                  </span>
                  <input
                    name="reason"
                    required
                    maxLength={500}
                    className="w-full rounded-sm border border-stone-300 px-2 py-1.5"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-sm border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-900 hover:bg-red-100"
                >
                  → {STATUS_LABELS[status]}
                </button>
              </form>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-sm border border-stone-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-medium tracking-wide text-stone-500 uppercase">
          История
        </h2>
        <ol className="mb-4 space-y-2 text-xs">
          {events.map((event) => (
            <li key={event.id} className="flex flex-wrap gap-x-3 border-b border-stone-100 pb-2 last:border-0">
              <span className="text-stone-400" title={event.createdAt.toISOString()}>
                {dateFormat.format(event.createdAt)}
              </span>
              <span>
                {event.fromStatus && event.fromStatus !== event.toStatus
                  ? `${STATUS_LABELS[event.fromStatus]} → ${STATUS_LABELS[event.toStatus]}`
                  : STATUS_LABELS[event.toStatus]}
              </span>
              <span className="text-stone-400">{event.actor}</span>
              {formatDetail(event.detail) ? (
                <code className="w-full text-stone-400">{formatDetail(event.detail)}</code>
              ) : null}
            </li>
          ))}
        </ol>

        <form action={addNote} className="flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
          <input type="hidden" name="orderId" value={order.id} />
          <label className="grow text-xs">
            <span className="mb-1 block text-stone-500">
              Бележка (напр. „обадих се два пъти, никой не отговори“)
            </span>
            <input name="note" maxLength={500} className="w-full rounded-sm border border-stone-300 px-2 py-1.5" />
          </label>
          <button
            type="submit"
            className="rounded-sm border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-100"
          >
            Добави бележка
          </button>
        </form>
      </section>
    </div>
  )
}

/**
 * Why the button is not there, in the words of someone who has to act on it.
 *
 * Each branch names the thing to do next rather than the state that is wrong —
 * "потвърди поръчката" is actionable where "неправилен статус" is not.
 */
function blockerText(blocker: NonNullable<ReturnType<typeof waybillBlocker>>): string {
  switch (blocker.reason) {
    case 'alreadyIssued':
      return `Вече има товарителница ${blocker.waybillNumber}.`
    case 'wrongStatus':
      return BOOKABLE_AFTER.includes(blocker.status)
        ? `Поръчката е в статус „${STATUS_LABELS[blocker.status]}“ — товарителницата вече е трябвало да е издадена.`
        : `Първо потвърди поръчката (сега е „${STATUS_LABELS[blocker.status]}“).`
    case 'notBookable':
      return blocker.courier === 'speedy'
        ? 'Speedy още не се поддържа — направи товарителницата ръчно в системата на Speedy.'
        : `Econt не е настроен за товарителници. Липсва: ${blocker.missing.join(', ')}.`
  }
}

/** The same, for the фактура. */
function invoiceBlockerText(blocker: NonNullable<ReturnType<typeof invoiceBlocker>>): string {
  switch (blocker.reason) {
    case 'alreadyIssued':
      return `Вече има фактура № ${blocker.number}.`
    case 'wrongStatus':
      return `Фактура се издава от „потвърдена“ нататък (сега е „${STATUS_LABELS[blocker.status]}“). За отказана или върната поръчка не се издава фактура.`
    case 'sellerIncomplete':
      return `Данните на продавача не са пълни, а фактурата ги носи. Липсва: ${blocker.missing.join(', ')}.`
  }
}

/** Statuses the parcel has already left the shop in, for the message above. */
const BOOKABLE_AFTER: readonly string[] = [
  'shipped',
  'delivered',
  'cod_collected',
  'reconciled',
  'refused_at_delivery',
  'returned',
]

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

function Field({
  name,
  label,
  defaultValue,
  required = false,
}: {
  name: string
  label: string
  defaultValue?: string
  required?: boolean
}) {
  return (
    <label className="text-xs">
      <span className="mb-1 block text-stone-500">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        maxLength={200}
        className="w-full rounded-sm border border-stone-300 px-2 py-1.5"
      />
    </label>
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
