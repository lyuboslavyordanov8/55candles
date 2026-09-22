import Link from 'next/link'

import { requireAdmin } from '@/lib/admin-auth'
import { formatMoney, money } from '@/lib/money'
import { listProformas, readProformaSnapshot } from '@/lib/proformas'
import type { Currency } from '@/lib/money'

/**
 * Every проформа written, newest first.
 *
 * The buyer is read out of the snapshot rather than kept in a column: there is
 * one reader and it needs the whole document anyway, so a column would be a
 * second copy of a fact that could drift from the first.
 */

export const metadata = {
  title: 'Проформи',
  robots: { index: false, follow: false, nocache: true },
}

const dateFormat = new Intl.DateTimeFormat('bg-BG', { dateStyle: 'short' })

export default async function ProformasPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; error?: string }>
}) {
  await requireAdmin()

  const { deleted, error } = await searchParams
  const rows = await listProformas()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link href="/admin" className="text-xs text-stone-500 underline">
            ← поръчки
          </Link>
          <h1 className="text-lg font-medium">Проформи</h1>
        </div>
        <Link
          href="/admin/proformas/new"
          className="rounded-sm border border-stone-800 bg-stone-800 px-3 py-1.5 text-xs text-white hover:bg-stone-700"
        >
          Нова проформа
        </Link>
      </div>

      {deleted && (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          Проформа № {deleted} е изтрита. Номерът остава изразходван — следващата получава
          следващия номер.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {error === 'missing'
            ? 'Тази проформа вече не съществува.'
            : 'Проформата не беше изтрита. Опитай отново.'}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-sm border border-stone-200 bg-white p-4 text-xs text-stone-500">
          Още няма издадени проформи.
        </p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-stone-300 text-left text-stone-500">
              <th className="py-2 font-medium">№</th>
              <th className="py-2 font-medium">Получател</th>
              <th className="py-2 font-medium">Издадена</th>
              <th className="py-2 font-medium">Валидна до</th>
              <th className="py-2 text-right font-medium">Сума</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((proforma) => {
              const snapshot = readProformaSnapshot(proforma.snapshot)
              const buyer = snapshot?.buyer

              return (
                <tr key={proforma.id} className="border-b border-stone-200">
                  <td className="py-2 tabular-nums">
                    <Link href={`/admin/proformas/${proforma.id}`} className="underline">
                      {proforma.number}
                    </Link>
                  </td>
                  <td className="py-2">{buyer?.company || buyer?.name || '—'}</td>
                  <td className="py-2">{dateFormat.format(proforma.issuedAt)}</td>
                  <td className="py-2">{dateFormat.format(proforma.validUntil)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatMoney(
                      money(proforma.totalMinor, proforma.currency as Currency),
                      'bg'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
