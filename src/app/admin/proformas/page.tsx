import Link from 'next/link'

import { requireAdmin } from '@/lib/admin-auth'
import { formatMoney, money, type Currency } from '@/lib/money'
import { listProformas, readProformaSnapshot } from '@/lib/proformas'
import {
  Badge,
  button,
  EmptyState,
  Notice,
  PageHeader,
  table,
  tableWrap,
  td,
  th,
  tr,
} from '@/components/admin/ui'

/**
 * Every проформа written, newest first.
 *
 * The buyer is read out of the snapshot rather than kept in a column: there is
 * one reader and it needs the whole document anyway, so a column would be a
 * second copy of a fact that could drift from the first.
 *
 * "Изтекла" is computed at render from `validUntil` and is not a stored state.
 * A проформа does not change when its date passes — the prices on it simply stop
 * being offered, and that is a fact about today rather than about the document.
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
  const now = Date.now()

  return (
    <>
      <PageHeader
        title="Проформи"
        back={{ href: '/admin', label: 'поръчки' }}
        description="Оферта за плащане по банка, без поръчка зад нея. Не е данъчен документ — фактура се издава след плащането."
        actions={
          <Link href="/admin/proformas/new" className={button('primary')}>
            Нова проформа
          </Link>
        }
      />

      {deleted && (
        <Notice tone="success">
          Проформа № {deleted} е изтрита. Номерът остава изразходван — следващата получава
          следващия номер.
        </Notice>
      )}

      {error && (
        <Notice>
          {error === 'missing'
            ? 'Тази проформа вече не съществува.'
            : 'Проформата не беше изтрита. Опитай отново.'}
        </Notice>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Още няма издадени проформи"
          description="Напиши проформа, когато клиент иска документ, за да плати по банка — за по-голяма или по поръчка партида."
          action={
            <Link href="/admin/proformas/new" className={button('primary')}>
              Нова проформа
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
                <th className={th}>Издадена</th>
                <th className={th}>Валидна до</th>
                <th className={`${th} text-right`}>Сума</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((proforma) => {
                const snapshot = readProformaSnapshot(proforma.snapshot)
                const buyer = snapshot?.buyer
                const expired = proforma.validUntil.getTime() < now

                return (
                  <tr key={proforma.id} className={tr}>
                    <td className={`${td} whitespace-nowrap`}>
                      <Link
                        href={`/admin/proformas/${proforma.id}`}
                        className="font-medium tabular-nums underline-offset-2 hover:underline"
                      >
                        {proforma.number}
                      </Link>
                    </td>
                    <td className={td}>{buyer?.company || buyer?.name || '—'}</td>
                    <td className={`${td} whitespace-nowrap text-ink-ghost tabular-nums`}>
                      {dateFormat.format(proforma.issuedAt)}
                    </td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>
                      {expired ? (
                        <Badge tone="neutral">изтекла {dateFormat.format(proforma.validUntil)}</Badge>
                      ) : (
                        <span className="text-ink-secondary">
                          {dateFormat.format(proforma.validUntil)}
                        </span>
                      )}
                    </td>
                    <td className={`${td} text-right font-medium whitespace-nowrap tabular-nums`}>
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
        </div>
      )}
    </>
  )
}
