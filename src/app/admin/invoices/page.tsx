import Link from 'next/link'

import { requireAdmin } from '@/lib/admin-auth'
import { listInvoices, readSnapshot } from '@/lib/invoices'
import { formatMoney, money, type Currency } from '@/lib/money'
import {
  button,
  EmptyState,
  PageHeader,
  table,
  tableWrap,
  td,
  th,
  tr,
} from '@/components/admin/ui'

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
    <>
      <PageHeader
        title="Фактури"
        back={{ href: '/admin', label: 'поръчки' }}
        description="Издадена фактура не се редактира и не се изтрива — номерът е част от редовна поредица. Грешка се коригира с кредитно известие, което се прави ръчно."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Още няма издадени фактури"
          description="Фактура се издава от страницата на поръчката, след като е потвърдена."
          action={
            <Link href="/admin" className={button('secondary')}>
              Към поръчките
            </Link>
          }
        />
      ) : (
        <div className={`${tableWrap} overflow-x-auto`}>
          <table className={table}>
            <thead className="bg-cream-surface/60">
              <tr>
                <th className={th}>№</th>
                <th className={th}>Получател</th>
                <th className={th}>Поръчка</th>
                <th className={th}>Издадена</th>
                <th className={`${th} text-right`}>Сума</th>
                <th className={`${th} text-right`}>Документ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => {
                const snapshot = readSnapshot(invoice.snapshot)
                const buyer = snapshot?.buyer

                return (
                  <tr key={invoice.id} className={tr}>
                    <td className={`${td} font-medium whitespace-nowrap tabular-nums`}>
                      {invoice.number}
                    </td>
                    <td className={td}>{buyer?.company || buyer?.name || '—'}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <Link
                        href={`/admin/orders/${invoice.orderId}`}
                        className="underline-offset-2 tabular-nums hover:underline"
                      >
                        {snapshot?.orderNumber ?? 'поръчката'}
                      </Link>
                    </td>
                    <td className={`${td} whitespace-nowrap text-ink-ghost tabular-nums`}>
                      {dateFormat.format(invoice.issuedAt)}
                    </td>
                    <td className={`${td} text-right font-medium whitespace-nowrap tabular-nums`}>
                      {formatMoney(money(invoice.totalMinor, invoice.currency as Currency), 'bg')}
                    </td>
                    <td className={`${td} text-right`}>
                      <Link
                        href={`/admin/orders/${invoice.orderId}/invoice`}
                        className={button('ghost', 'sm')}
                      >
                        За печат
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
