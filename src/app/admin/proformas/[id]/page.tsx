import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireAdmin } from '@/lib/admin-auth'
import { formatMoney, money, type Currency } from '@/lib/money'
import { getProforma, readProformaSnapshot } from '@/lib/proformas'
import ConfirmSubmit from '@/components/admin/ConfirmSubmit'
import { removeProforma } from '../actions'

/**
 * The проформа, ready for a printer.
 *
 * HTML and `@media print`, the same choice the фактура makes and for the same
 * two reasons: a PDF library would have to carry a Cyrillic font to render
 * `ВиреонЛабс ЕООД` as letters rather than boxes, and everything here comes out
 * of the stored snapshot, so printing it in a year prints what it says today.
 *
 * Differences from the фактура, all of them legal rather than cosmetic: no
 * данъчно събитие, a „валидна до“ instead, the bank account it is to be paid
 * into, and a line saying it is not an accounting document.
 *
 * Nothing on this page writes.
 */

export const metadata = {
  title: 'Проформа фактура',
  robots: { index: false, follow: false, nocache: true },
}

const dateFormat = new Intl.DateTimeFormat('bg-BG', { dateStyle: 'short' })

export default async function ProformaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireAdmin()

  const { id } = await params
  const { error } = await searchParams
  const proforma = await getProforma(id)
  if (!proforma) notFound()

  const snapshot = readProformaSnapshot(proforma.snapshot)

  // A row whose shape this version does not recognise. A plain refusal beats a
  // document with silently empty fields — see `readProformaSnapshot`.
  if (!snapshot) {
    return (
      <div className="space-y-3">
        <Link href="/admin/proformas" className="inline-flex items-center gap-1 text-xs text-ink-ghost transition-colors hover:text-ink-primary">
          ← всички проформи
        </Link>
        <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          Проформа № {proforma.number} е записана в формат, който тази версия не разпознава. Данните
          са в базата (таблица `proformas`), но не се изобразяват тук.
        </p>
      </div>
    )
  }

  const currency = snapshot.money.currency as Currency
  const amount = (minor: number) => formatMoney(money(minor, currency), 'bg')
  const { seller, buyer, bank, money: totals } = snapshot

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/admin/proformas" className="inline-flex items-center gap-1 text-xs text-ink-ghost transition-colors hover:text-ink-primary">
          ← всички проформи
        </Link>
        <p className="rounded-md border border-border bg-paper-white px-2.5 py-1.5 text-xs text-ink-secondary">
          Печат с <kbd className="font-medium">Ctrl+P</kbd> · A4, без полета на браузъра
        </p>
      </div>

      {/*
        The sheet keeps neutral greys and true black rather than the admin's warm
        brand ink: this is a document that comes out of a printer, and warming the
        type of a legal document to match the interface around it would be the
        interface deciding how the paperwork looks. The chrome above is brand; the
        page below is a page.
      */}
      <article className="mx-auto w-[210mm] max-w-full bg-white p-[15mm] text-[10pt] leading-snug text-black shadow-[0_1px_2px_rgba(46,37,33,0.05),0_12px_32px_-16px_rgba(46,37,33,0.22)] print:w-auto print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-black pb-3">
          <div>
            <h1 className="text-[16pt] font-semibold tracking-wide">ПРОФОРМА ФАКТУРА</h1>
            <p className="text-[9pt] uppercase">Не е данъчен документ</p>
          </div>
          <dl className="text-right">
            <div>
              <dt className="inline text-[9pt]">№ </dt>
              <dd className="inline text-[13pt] font-semibold tabular-nums">{snapshot.number}</dd>
            </div>
            <Pair label="Дата на издаване" value={dateFormat.format(new Date(snapshot.issuedAt))} />
            <Pair label="Валидна до" value={dateFormat.format(new Date(snapshot.validUntil))} />
            <Pair label="Място на издаване" value={seller.city} />
          </dl>
        </header>

        <div className="grid grid-cols-2 gap-6 py-4">
          <Party title="Доставчик">
            <Line label="Фирма" value={seller.legalName} strong />
            <Line label="ЕИК" value={seller.eik} />
            <Line label="ДДС №" value={seller.vatNumber ?? 'нерегистриран по ЗДДС'} />
            <Line label="Адрес" value={seller.address} />
            <Line label="Имейл" value={seller.email} />
          </Party>

          <Party title="Получател">
            {buyer.company && <Line label="Фирма" value={buyer.company} strong />}
            <Line
              label={buyer.company ? 'Лице за контакт' : 'Име'}
              value={buyer.name}
              strong={!buyer.company}
            />
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
              <tr key={index} className="border-b border-stone-300">
                <td className="py-1 align-top tabular-nums">{index + 1}</td>
                <td className="py-1">{line.description}</td>
                <td className="py-1 text-right tabular-nums">{line.quantity} бр.</td>
                <td className="py-1 text-right tabular-nums">{amount(line.unitPriceMinor)}</td>
                <td className="py-1 text-right tabular-nums">{amount(line.lineTotalMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex justify-end">
          <dl className="w-72 text-[9.5pt]">
            {/*
              No VAT line and no данъчна основа: the seller is not registered, so
              there is no tax to break out, and a `0.00 € ДДС` row would suggest a
              rate was applied. The basis in words carries it instead.
            */}
            <Total label="Общо за плащане" value={amount(totals.totalMinor)} strong />
          </dl>
        </div>

        <div className="mt-4 space-y-1 border-t border-stone-300 pt-3 text-[9pt]">
          <p>Начин на плащане: {snapshot.paymentNote}</p>
          <p>
            <span className="text-stone-600">Титуляр: </span>
            {bank.holder}
            <span className="text-stone-600"> · IBAN: </span>
            <span className="font-medium tabular-nums">{bank.iban}</span>
            <span className="text-stone-600"> · BIC: </span>
            <span className="tabular-nums">{bank.bic}</span>
            <span className="text-stone-600"> · Банка: </span>
            {bank.bankName}
          </p>
          <p>
            <span className="text-stone-600">Основание за плащане: </span>
            Проформа фактура № {snapshot.number}
          </p>
          <p>{snapshot.vatNote}</p>
          {snapshot.note && <p className="pt-1">{snapshot.note}</p>}
          <p className="pt-1 text-stone-600">{snapshot.kindNote}</p>
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

      {/*
        Below the document, never on it. Deleting a проформа is lawful — it is an
        offer, not an accounting document — but the number is not handed back:
        see `deleteProforma`.
      */}
      <section className="mx-auto w-[210mm] max-w-full space-y-3 rounded-lg border border-border bg-paper-white p-4 print:hidden">
        <h2 className="text-[11px] font-medium tracking-wide text-ink-ghost uppercase">Изтриване</h2>
        <p className="text-xs text-ink-secondary">
          Проформата не е данъчен документ, така че може да се изтрие. Номер{' '}
          {snapshot.number} остава изразходван — ако вече е изпратен на клиент, втори
          документ със същия номер е по-лошо от дупка в поредицата.
        </p>

        {error === 'confirm' && (
          <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Номерът не съвпада — проформата не е изтрита.
          </p>
        )}

        <form action={removeProforma}>
          <input type="hidden" name="id" value={proforma.id} />
          <ConfirmSubmit expected={proforma.number} buttonLabel="Изтрий проформата" />
        </form>
      </section>
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
      <h2 className="mb-1 border-b border-stone-300 pb-1 text-[9pt] font-semibold uppercase">
        {title}
      </h2>
      <dl className="space-y-0.5">{children}</dl>
    </section>
  )
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="text-[9.5pt]">
      <dt className="inline text-stone-600">{label}: </dt>
      <dd className={`inline${strong ? ' font-semibold' : ''}`}>{value}</dd>
    </div>
  )
}

function Total({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-4 py-0.5${
        strong ? ' border-t border-black pt-1 text-[11pt] font-semibold' : ''
      }`}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
