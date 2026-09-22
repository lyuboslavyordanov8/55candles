import Link from 'next/link'

import { requireAdmin } from '@/lib/admin-auth'
import { listInvoices, readSnapshot } from '@/lib/invoices'
import { formatMoney, money, type Currency } from '@/lib/money'

/**
 * Every фактура issued, newest first.
 *
 * Read-only, and there is no delete here. An issued invoice is an accounting
 * document: the series may not have gaps and the document is already in somebody
 * else's books, so a wrong one is corrected by a кредитно известие and never by
 * removing the row. The page says so, because the absence of a button is a
 * decision and an admin is entitled to know it was made on purpose.
 *
 * Proformas have their own list, and those *can* be deleted — they are offers,
 * not accounting documents.
 */

export const metadata = {
  title: 'Фактури',
  robots: { index: false, follow: false, nocache: true },
}

const dateFormat = new Intl.DateTimeFormat('bg-BG', { dateStyle: 'short' })

export default async function InvoicesPage() {
  await requireAdmin()

  const rows = await listInvoices()

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin" className="text-xs text-stone-500 underline">
          ← поръчки
        </Link>
        <h1 className="text-lg font-medium">Фактури</h1>
        <p className="text-xs text-stone-500">
          Издадена фактура не се редактира и не се изтрива — номерът вече е част от редовна
          поредица. Грешка се коригира с кредитно известие, което се прави ръчно.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-sm border border-stone-200 bg-white p-4 text-xs text-stone-500">
          Още няма издадени фактури.
        </p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-stone-300 text-left text-stone-500">
              <th className="py-2 font-medium">№</th>
              <th className="py-2 font-medium">Получател</th>
              <th className="py-2 font-medium">Поръчка</th>
              <th className="py-2 font-medium">Издадена</th>
              <th className="py-2 text-right font-medium">Сума</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((invoice) => {
              const snapshot = readSnapshot(invoice.snapshot)
              const buyer = snapshot?.buyer

              return (
                <tr key={invoice.id} className="border-b border-stone-200">
                  <td className="py-2 tabular-nums">
                    <Link
                      href={`/admin/orders/${invoice.orderId}/invoice`}
                      className="underline"
                    >
                      {invoice.number}
                    </Link>
                  </td>
                  <td className="py-2">{buyer?.company || buyer?.name || '—'}</td>
                  <td className="py-2">
                    <Link href={`/admin/orders/${invoice.orderId}`} className="underline">
                      {snapshot?.orderNumber ?? 'поръчката'}
                    </Link>
                  </td>
                  <td className="py-2">{dateFormat.format(invoice.issuedAt)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatMoney(money(invoice.totalMinor, invoice.currency as Currency), 'bg')}
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
