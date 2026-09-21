import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireAdmin } from '@/lib/admin-auth'
import { getInvoiceForOrder, readSnapshot, snapshotCurrency } from '@/lib/invoices'
import { formatMoney, money } from '@/lib/money'

/**
 * The фактура, ready for a printer (AUDIT.md Q-27, Phase 7).
 *
 * HTML and `@media print`, not a generated PDF. Two reasons, in order of weight:
 *
 * 1. A PDF library would have to carry a Cyrillic font — the built-in ones are
 *    WinAnsi and render `ВиреонЛабс ЕООД` as boxes — which is a megabyte of
 *    binary in the bundle to produce a page the browser already prints, complete
 *    with "save as PDF".
 * 2. Everything shown here comes from `invoices.snapshot`, so the document is the
 *    stored record rendered, not the current state of the shop re-derived. Print
 *    it in a year and it says what it said today.
 *
 * Nothing on this page writes. Issuing is the form on the order page.
 */

export const metadata = {
  title: 'Фактура',
  robots: { index: false, follow: false, nocache: true },
}

const dateFormat = new Intl.DateTimeFormat('bg-BG', { dateStyle: 'short' })

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()

  const { id } = await params
  const invoice = await getInvoiceForOrder(id)
  if (!invoice) notFound()

  const snapshot = readSnapshot(invoice.snapshot)

  // A stored row whose shape this version does not recognise. Better a plain
  // refusal than a document with silently empty fields — see `readSnapshot`.
  if (!snapshot) {
    return (
      <div className="space-y-3">
        <Link href={`/admin/orders/${id}`} className="text-xs underline">
          ← към поръчката
        </Link>
        <p role="alert" className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-xs">
          Фактура № {invoice.number} е записана в формат, който тази версия не разпознава. Данните са
          налични в базата (таблица `invoices`), но не се изобразяват тук.
        </p>
      </div>
    )
  }

  const currency = snapshotCurrency(snapshot)
  const amount = (minor: number) => formatMoney(money(minor, currency), 'bg')
  const { seller, buyer, money: totals } = snapshot

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/admin/orders/${id}`} className="text-xs underline">
          ← към поръчката
        </Link>
        <p className="text-xs text-stone-500">
          Печат с Ctrl+P. Изберете A4 и без полета на браузъра (header/footer).
        </p>
      </div>

      {/*
        A4 at 96dpi is 210mm wide; the width is set in millimetres so what the
        screen shows is the sheet that comes out, rather than a layout that
        reflows at print time.
      */}
      <article className="mx-auto w-[210mm] max-w-full bg-white p-[15mm] text-[10pt] leading-snug text-black shadow-sm print:w-auto print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-black pb-3">
          <div>
            <h1 className="text-[16pt] font-semibold tracking-wide">ФАКТУРА</h1>
            <p className="text-[9pt] uppercase">Оригинал</p>
          </div>
          <dl className="text-right">
            <div>
              <dt className="inline text-[9pt]">№ </dt>
              <dd className="inline text-[13pt] font-semibold tabular-nums">{snapshot.number}</dd>
            </div>
            <Pair label="Дата на издаване" value={dateFormat.format(new Date(snapshot.issuedAt))} />
            <Pair
              label="Дата на данъчното събитие"
              value={
                snapshot.saleDate
                  ? dateFormat.format(new Date(snapshot.saleDate))
                  : 'при доставката'
              }
            />
            <Pair label="Място на издаване" value={seller.city} />
          </dl>
        </header>

        <div className="grid grid-cols-2 gap-6 py-4">
          <Party title="Доставчик">
            <Line label="Фирма" value={seller.legalName} strong />
            <Line label="ЕИК" value={seller.eik} />
            {/*
              Not VAT-registered, so there is no number. The row stays with its
              reason in it: an empty "ДДС №" reads as a form somebody forgot.
            */}
            <Line label="ДДС №" value={seller.vatNumber ?? 'нерегистриран по ЗДДС'} />
            <Line label="Адрес" value={seller.address} />
            <Line label="Имейл" value={seller.email} />
          </Party>

          <Party title="Получател">
            {buyer.company && <Line label="Фирма" value={buyer.company} strong />}
            <Line label={buyer.company ? 'Лице за контакт' : 'Име'} value={buyer.name} strong={!buyer.company} />
            {buyer.eik && <Line label="ЕИК" value={buyer.eik} />}
            {buyer.vatNumber && <Line label="ДДС №" value={buyer.vatNumber} />}
            {buyer.address && <Line label="Адрес" value={buyer.address} />}
            {buyer.accountable && <Line label="МОЛ" value={buyer.accountable} />}
          </Party>
        </div>

        <table className="w-full border-collapse text-[9.5pt]">
          <thead>
            <tr className="border-y border-black text-left">
              <th className="w-8 py-1 font-medium">№</th>
              <th className="py-1 font-medium">Наименование</th>
              <th className="w-20 py-1 text-right font-medium">К-во</th>
              <th className="w-28 py-1 text-right font-medium">Ед. цена</th>
              <th className="w-28 py-1 text-right font-medium">Стойност</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.lines.map((line, index) => (
              <tr key={`${line.productSlug}-${index}`} className="border-b border-stone-300">
                <td className="py-1 align-top tabular-nums">{index + 1}</td>
                <td className="py-1">{line.name}</td>
                <td className="py-1 text-right tabular-nums">{line.quantity} бр.</td>
                <td className="py-1 text-right tabular-nums">{amount(line.unitPriceMinor)}</td>
                <td className="py-1 text-right tabular-nums">{amount(line.lineTotalMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex justify-end">
          <dl className="w-72 text-[9.5pt]">
            <Total label="Стоки" value={amount(totals.goodsMinor)} />
            {totals.discountMinor > 0 && (
              <Total
                label={`Отстъпка${totals.promoCode ? ` (${totals.promoCode})` : ''}`}
                value={`−${amount(totals.discountMinor)}`}
              />
            )}
            <Total
              label={totals.shippingMinor === 0 ? 'Доставка (безплатна)' : 'Доставка'}
              value={amount(totals.shippingMinor)}
            />
            {totals.codFeeMinor !== null && (
              <Total label="Такса наложен платеж" value={amount(totals.codFeeMinor)} />
            )}
            {/*
              No VAT line and no "данъчна основа": the seller is not registered,
              so there is no tax to break out, and a `0.00 лв. ДДС` row would
              suggest a rate was applied. The basis in words carries it instead.
            */}
            <Total label="Общо за плащане" value={amount(totals.totalMinor)} strong />
          </dl>
        </div>

        <div className="mt-4 space-y-1 border-t border-stone-300 pt-3 text-[9pt]">
          <p>{snapshot.vatNote}</p>
          <p>Начин на плащане: {snapshot.paymentNote}</p>
          <p className="text-stone-600">Към поръчка {snapshot.orderNumber}</p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-6 text-[9pt]">
          <div>
            <p>Съставил: {snapshot.issuedBy}</p>
            <p className="mt-6 border-t border-stone-400 pt-1 text-stone-500">подпис</p>
          </div>
          <div>
            <p>Получил:</p>
            <p className="mt-6 border-t border-stone-400 pt-1 text-stone-500">подпис</p>
          </div>
        </div>
      </article>
    </div>
  )
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-[9pt]">
      <dt className="inline text-stone-600">{label}: </dt>
      <dd className="inline">{value}</dd>
    </div>
  )
}

function Party({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-[9pt] font-medium uppercase">{title}</h2>
      <dl className="space-y-0.5 text-[9.5pt]">{children}</dl>
    </section>
  )
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-stone-600">{label}</dt>
      <dd className={strong ? 'font-medium' : undefined}>{value}</dd>
    </div>
  )
}

function Total({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-4 py-0.5 ${
        strong ? 'mt-1 border-t border-black pt-1 text-[11pt] font-semibold' : ''
      }`}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
