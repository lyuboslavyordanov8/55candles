import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireAdmin } from '@/lib/admin-auth'
import { getOrderDetail, refusalHistory, undoEligibility, UNDO_WINDOW_MS } from '@/lib/admin-orders'
import { nextStatuses, STATUS_LABELS, statusRequiresReason } from '@/lib/order-status'
import { formatMoney, money } from '@/lib/money'
import { defaultBuyerFor, getInvoiceForOrder, invoiceBlocker } from '@/lib/invoices'
import { labelPath, labelPdfUrl, waybillBlocker } from '@/lib/waybills'
import { econtSender, econtShipFrom } from '@/lib/couriers'
import CopyButton from '@/components/admin/CopyButton'
import ConfirmSubmit from '@/components/admin/ConfirmSubmit'
import WaybillPreviewModal from '@/components/admin/WaybillPreviewModal'
import OrderStatusBadge from '@/components/admin/OrderStatusBadge'
import OrderStatusRail from '@/components/admin/OrderStatusRail'
import { TrackingPanel } from '@/components/admin/ShipmentTracking'
import { trackOrder } from '@/lib/tracking'
import {
  button,
  DetailRow,
  fieldLabel,
  input,
  Notice,
  PageHeader,
  panel,
  Section,
} from '@/components/admin/ui'
import { addNote, changeStatus, issueInvoice, issueWaybill, undoStatusChange } from '../../actions'

/**
 * One order: everything needed to pack it, ship it and settle it.
 *
 * The blocks are in the order they are used — where the parcel is, what to put in
 * the box, where it goes and who to call, then the paperwork, then what can be
 * done to it now, then what has happened so far. Status moves are single-click
 * buttons, one per status the order may go to next (`src/lib/order-status.ts`
 * decides which), with a short Undo window rather than a dropdown-and-save: see
 * `undoEligibility`. `refused_at_delivery` and `returned` are the one exception —
 * both require a reason, so both need a field before they can be a click, and
 * both are kept away from the ordinary buttons because neither is an ordinary
 * step.
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
 * Who the parcel is from, for the preview modal — `null` when the courier has
 * no ad-hoc sender identity to show.
 *
 * Only Econt has one: its sender is a name and phone this shop configures (see
 * `EcontSender` in `src/lib/couriers/econt.ts`). Speedy takes its sender from
 * the contract client instead, so there is no name typed anywhere to preview.
 */
function senderPreview(courier: string): { name: string; phone: string; from: string } | null {
  if (courier !== 'econt') return null

  const sender = econtSender()
  const shipFrom = econtShipFrom()
  if (!sender || !shipFrom) return null

  const from = shipFrom.officeCode
    ? `от офис (код ${shipFrom.officeCode})`
    : `от адрес: ${shipFrom.street}, ${shipFrom.postCode} ${shipFrom.city}`

  return { name: sender.name, phone: sender.phone, from }
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

  const [issued, tracking] = await Promise.all([getInvoiceForOrder(order.id), trackOrder(order)])
  const invoiceStop = invoiceBlocker(order, issued)
  const buyer = defaultBuyerFor(order)

  const upcoming = nextStatuses(order.status)
  const normalNext = upcoming.filter((status) => !statusRequiresReason(status))
  const reasonNext = upcoming.filter(statusRequiresReason)

  return (
    <>
      <PageHeader
        title={order.orderNumber}
        back={{ href: '/admin', label: 'всички поръчки' }}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {dateFormat.format(order.createdAt)}
            <OrderStatusBadge status={order.status} />
          </span>
        }
        meta={
          <div className="text-right">
            <span className="block text-[11px] tracking-wide text-ink-ghost uppercase">
              наложен платеж
            </span>
            <span className="font-serif text-2xl leading-tight text-charcoal tabular-nums">
              {amount(order.totalMinor)}
            </span>
          </div>
        }
      />

      <div className={`${panel} px-4 py-3`}>
        <OrderStatusRail status={order.status} />
      </div>

      {refusals.length > 0 && (
        <Notice tone="danger">
          Този телефон има {refusals.length}{' '}
          {refusals.length === 1
            ? 'предишна отказана/върната поръчка'
            : 'предишни отказани/върнати поръчки'}
          :{' '}
          {refusals.map((row, index) => (
            <span key={row.id}>
              {index > 0 && ', '}
              <Link href={`/admin/orders/${row.id}`} className="underline">
                {row.orderNumber}
              </Link>
            </span>
          ))}
          . Провери преди да подадеш отново.
        </Notice>
      )}

      {error && notices[error] && <Notice>{notices[error]}</Notice>}

      {waybill && (
        <Notice tone="success">
          Товарителница {waybill} е издадена. Разпечатай етикета и подай пратката на Econt.
        </Notice>
      )}

      {invoice && (
        <Notice tone="success">
          Фактура № {invoice} е издадена.{' '}
          <Link href={`/admin/orders/${order.id}/invoice`} className="underline">
            Отвори за печат
          </Link>
          .
        </Notice>
      )}

      {noted && <Notice tone="success">Бележката е записана.</Notice>}

      {changed && STATUS_LABELS[changed as keyof typeof STATUS_LABELS] && (
        <Notice tone="success">
          Статусът е сменен на „{STATUS_LABELS[changed as keyof typeof STATUS_LABELS]}“.
        </Notice>
      )}

      {reverted && STATUS_LABELS[reverted as keyof typeof STATUS_LABELS] && (
        <Notice tone="success">
          Отменено — статусът е върнат на „
          {STATUS_LABELS[reverted as keyof typeof STATUS_LABELS]}“.
        </Notice>
      )}

      <section className={panel}>
        <h2 className="border-b border-border/60 px-4 py-3 text-[11px] font-medium tracking-wide text-ink-ghost uppercase">
          За опаковане
        </h2>
        <table className="w-full border-collapse text-xs">
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border/60">
                <td className="px-4 py-2.5">
                  <span className="block text-ink-primary">{item.name}</span>
                  <span className="block text-ink-ghost">{item.productSlug}</span>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                  {item.quantity} бр.
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-ink-ghost tabular-nums">
                  {amount(item.unitPriceMinor)} / бр.
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">
                  {amount(item.lineTotalMinor)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-ink-secondary">
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
              <td colSpan={3} className="px-4 pt-1 pb-3 text-ink-ghost">
                Тегло на пратката
              </td>
              <td className="px-4 pt-1 pb-3 text-right text-ink-ghost tabular-nums">
                {order.weightGrams} г
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <Section
          title="Доставка"
          actions={<CopyButton text={addressForCopy(order)} label="Копирай адреса" />}
        >
          <dl>
            <DetailRow label="Куриер">
              {order.courier === 'econt' ? 'Econt' : 'Speedy'} ·{' '}
              {methodLabels[order.deliveryMethod] ?? order.deliveryMethod}
            </DetailRow>
            {order.deliveryMethod === 'door' ? (
              <DetailRow label="Адрес">
                {order.street}, {order.postCode} {order.city}
              </DetailRow>
            ) : (
              <DetailRow label="Офис">
                {order.officeName || '—'}
                {order.officeAddress ? `, ${order.officeAddress}` : ''}
                <span className="block text-ink-ghost">
                  код {order.officeId || '—'} · {order.postCode} {order.city}
                </span>
              </DetailRow>
            )}
            {order.note && <DetailRow label="Бележка">{order.note}</DetailRow>}
            <DetailRow label="Товарителница">
              {order.waybillNumber ? (
                order.trackingUrl ? (
                  <a
                    href={order.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline tabular-nums"
                  >
                    {order.waybillNumber}
                  </a>
                ) : (
                  <span className="tabular-nums">{order.waybillNumber}</span>
                )
              ) : (
                '—'
              )}
            </DetailRow>
          </dl>
        </Section>

        <Section title="Клиент">
          <dl>
            <DetailRow label="Име">{order.recipientName}</DetailRow>
            <DetailRow label="Телефон">
              <a href={`tel:${order.phone}`} className="underline tabular-nums">
                {order.phone}
              </a>
            </DetailRow>
            <DetailRow label="Имейл">
              {order.email ? (
                <a href={`mailto:${order.email}`} className="underline">
                  {order.email}
                </a>
              ) : (
                '— (без имейл, потвърждение не е изпратено)'
              )}
            </DetailRow>
          </dl>
        </Section>
      </div>

      {tracking && (
        <Section
          title="Проследяване"
          description={`На живо от ${order.courier === 'econt' ? 'Econt' : 'Speedy'} при всяко отваряне на страницата.`}
        >
          <TrackingPanel
            lookup={tracking}
            orderStatus={order.status}
            courierLabel={order.courier === 'econt' ? 'Econt' : 'Speedy'}
          />
        </Section>
      )}

      <Section title="Товарителница">
        {order.waybillNumber ? (
          <div className="space-y-3 text-xs text-ink-secondary">
            <p>
              Издадена: <span className="font-medium tabular-nums">{order.waybillNumber}</span>
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
            </p>

            {/*
              A link, not a button that prints: Chrome renders a PDF in its own
              cross-origin viewer, so no script on this page can open the print
              dialog over one — `contentWindow.print()` throws. The tab is where
              printing is possible, so the tab is what this offers. See the route.
            */}
            {pdfUrl && (
              <div>
                <a
                  href={labelPath(order.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={button('secondary')}
                >
                  Принтирай етикета ↗
                </a>
                <span className="mt-1.5 block text-ink-ghost">
                  Отваря се в нов таб — оттам Ctrl+P.
                </span>
              </div>
            )}

            <p className="text-ink-ghost">
              Втора товарителница за същата поръчка не се издава оттук. Ако тази е грешна, отмени я
              в my.econt.com.
            </p>
          </div>
        ) : blocker ? (
          <p className="text-xs text-ink-secondary">{blockerText(blocker)}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-ink-secondary">
              Econt ще издаде истинска товарителница на {amount(order.totalMinor)} наложен
              платеж — прегледай данните преди да я издадеш.
            </p>
            <WaybillPreviewModal
              orderId={order.id}
              orderNumber={order.orderNumber}
              courierLabel={order.courier === 'econt' ? 'Econt' : 'Speedy'}
              sender={senderPreview(order.courier)}
              recipientName={order.recipientName}
              recipientPhone={order.phone}
              destination={
                order.deliveryMethod === 'door'
                  ? `${order.street}, ${order.postCode} ${order.city}`
                  : `${methodLabels[order.deliveryMethod] ?? order.deliveryMethod} ${order.officeName} (код ${order.officeId}), ${order.postCode} ${order.city}`
              }
              weightGrams={order.weightGrams}
              codAmount={amount(order.totalMinor)}
              issueWaybill={issueWaybill}
            />
          </div>
        )}
      </Section>

      <Section title="Фактура">
        {issued ? (
          <div className="space-y-1.5 text-xs text-ink-secondary">
            <p>
              Издадена: <span className="font-medium tabular-nums">№ {issued.number}</span> ·{' '}
              {dateFormat.format(issued.issuedAt)} ·{' '}
              <Link href={`/admin/orders/${order.id}/invoice`} className="underline">
                за печат
              </Link>
            </p>
            <p className="text-ink-ghost">
              Фактурата не се редактира и не се изтрива — номерът вече е част от редовна поредица.
              Грешка се коригира с кредитно известие, което се прави ръчно.
            </p>
          </div>
        ) : invoiceStop ? (
          <p className="text-xs text-ink-secondary">{invoiceBlockerText(invoiceStop)}</p>
        ) : (
          <form action={issueInvoice} className="space-y-4">
            <input type="hidden" name="orderId" value={order.id} />
            <p className="text-xs text-ink-secondary">
              Фактура на {amount(order.totalMinor)} без ДДС (дружеството не е регистрирано по ЗДДС).
              По подразбиране на физическото лице от поръчката — попълни полетата само ако клиентът
              иска фактура на фирма.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
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
      </Section>

      <Section title="Следваща стъпка">
        {undo.eligible && (
          <form
            action={undoStatusChange}
            className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            <input type="hidden" name="orderId" value={order.id} />
            <span>
              Последна промяна преди{' '}
              {Math.round((Date.now() - undo.event.createdAt.getTime()) / 1000)} сек.
            </span>
            <button
              type="submit"
              className="inline-flex h-7 items-center rounded-md border border-amber-300 bg-paper-white px-2.5 font-medium transition-colors hover:bg-amber-100"
            >
              Отмени (до {Math.round(UNDO_WINDOW_MS / 60_000)} мин.)
            </button>
          </form>
        )}

        {upcoming.length === 0 ? (
          <p className="text-xs text-ink-secondary">
            Поръчката е приключена — няма следващ статус.
          </p>
        ) : (
          <div className="space-y-4">
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
                    <button type="submit" className={button('primary')}>
                      {STATUS_LABELS[status]} →
                    </button>
                  </form>
                ))}
              </div>
            )}

            {reasonNext.length > 0 && (
              <div className="space-y-3 border-t border-border/60 pt-4">
                <p className="text-[11px] font-medium tracking-wide text-ink-ghost uppercase">
                  Развалена продажба
                </p>
                {reasonNext.map((status) => (
                  <form
                    key={status}
                    action={changeStatus}
                    className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-cream-surface/60 p-3"
                  >
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="expectedFrom" value={order.status} />
                    <input type="hidden" name="to" value={status} />
                    <label className="grow">
                      <span className={fieldLabel}>
                        Причина (задължително за „{STATUS_LABELS[status]}“)
                      </span>
                      <input name="reason" required maxLength={500} className={input} />
                    </label>
                    <button type="submit" className={button('danger')}>
                      {STATUS_LABELS[status]} →
                    </button>
                  </form>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="История">
        <ol className="space-y-0">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 py-2 text-xs last:border-0"
            >
              <span className="text-ink-ghost tabular-nums" title={event.createdAt.toISOString()}>
                {dateFormat.format(event.createdAt)}
              </span>
              <span className="text-ink-primary">
                {event.fromStatus && event.fromStatus !== event.toStatus
                  ? `${STATUS_LABELS[event.fromStatus]} → ${STATUS_LABELS[event.toStatus]}`
                  : STATUS_LABELS[event.toStatus]}
              </span>
              <span className="text-ink-ghost">{event.actor}</span>
              {formatDetail(event.detail) ? (
                <code className="w-full break-all text-[11px] text-ink-ghost">
                  {formatDetail(event.detail)}
                </code>
              ) : null}
            </li>
          ))}
        </ol>

        <form
          action={addNote}
          className="mt-4 flex flex-wrap items-end gap-2 border-t border-border/60 pt-4"
        >
          <input type="hidden" name="orderId" value={order.id} />
          <label className="grow">
            <span className={fieldLabel}>Бележка</span>
            <input
              name="note"
              maxLength={500}
              placeholder="напр. обадих се два пъти, никой не отговори"
              className={input}
            />
          </label>
          <button type="submit" className={button('secondary')}>
            Добави бележка
          </button>
        </form>
      </Section>
    </>
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
    <label className="block">
      <span className={fieldLabel}>{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        maxLength={200}
        className={input}
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
    <tr className={strong ? 'border-t border-border font-medium text-ink-primary' : undefined}>
      <td colSpan={3} className={`px-4 ${strong ? 'pt-2 pb-1' : 'py-1'}`}>
        {label}
      </td>
      <td className={`px-4 text-right whitespace-nowrap tabular-nums ${strong ? 'pt-2 pb-1' : 'py-1'}`}>
        {value}
      </td>
    </tr>
  )
}
