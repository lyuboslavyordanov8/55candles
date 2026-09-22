import Link from 'next/link'

import { requireAdmin } from '@/lib/admin-auth'
import { formatMoney, money, type Currency } from '@/lib/money'
import { listExpenses } from '@/lib/accounting/expenses'
import { formatPeriod, isPeriodKey, periodOf, recentPeriods } from '@/lib/accounting/period-key'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  labelOf,
} from '@/lib/accounting/vocabulary'
import { markExpenseDocument, markExpenseStatus } from '../actions'
import {
  Badge,
  button,
  EmptyState,
  fieldLabel,
  input,
  Notice,
  PageHeader,
  panel,
  select,
  table,
  tableWrap,
  td,
  th,
  tr,
  type Tone,
} from '@/components/admin/ui'

/**
 * The shop's purchases, filtered the way they get looked for.
 *
 * Four filters, and each exists because of a real question: "what did I spend in
 * September" (period), "what still has no document" (missing), "what have I not
 * checked" (status), and "how much have we given Meta" (search). Everything is
 * in the URL, so a filtered view is a link the owner can keep.
 *
 * The two actions in a row — mark the document found, mark the expense checked —
 * are the whole workflow, so they are in the row rather than behind a menu.
 */

export const metadata = {
  title: 'Разходи',
  robots: { index: false, follow: false, nocache: true },
}

const dateFormat = new Intl.DateTimeFormat('bg-BG', { dateStyle: 'short' })

const STATUS_TONE: Record<string, Tone> = {
  needs_review: 'warning',
  ready: 'info',
  sent: 'info',
  accounted: 'success',
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string
    status?: string
    category?: string
    q?: string
    missing?: string
    saved?: string
    deleted?: string
  }>
}) {
  await requireAdmin()

  const params = await searchParams
  const period = params.period && isPeriodKey(params.period) ? params.period : ''
  const status = params.status ?? ''
  const category = params.category ?? ''
  const query = params.q ?? ''
  const onlyMissing = params.missing === '1'

  const rows = await listExpenses({
    ...(period ? { period } : {}),
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
    ...(query ? { query } : {}),
    ...(onlyMissing ? { missingDocument: true } : {}),
  })

  const total = rows.reduce((sum, expense) => sum + expense.totalMinor, 0)
  const filtered = Boolean(period || status || category || query || onlyMissing)
  const back = currentHref(params)

  return (
    <>
      <PageHeader
        title="Разходи"
        back={{ href: '/admin/accounting', label: 'счетоводство' }}
        description={
          rows.length > 0
            ? `${rows.length} ${rows.length === 1 ? 'разход' : 'разхода'} · ${formatMoney(money(total), 'bg')}`
            : 'Нищо по този филтър.'
        }
        actions={
          <Link href="/admin/accounting/expenses/new" className={button('primary')}>
            Добави разход
          </Link>
        }
      />

      {params.saved && <Notice tone="success">Разход {params.saved} е записан.</Notice>}
      {params.deleted && <Notice tone="success">Разходът е изтрит.</Notice>}

      <form className={`${panel} flex flex-wrap items-end gap-3 p-3`} action="/admin/accounting/expenses">
        <label className="min-w-0 flex-1 basis-56">
          <span className={fieldLabel}>Търсене</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="доставчик, ЕИК, номер или EXP-…"
            className={input}
          />
        </label>

        <label className="basis-40">
          <span className={fieldLabel}>Месец</span>
          <select name="period" defaultValue={period} className={select}>
            <option value="">всички</option>
            {recentPeriods(13).map((value) => (
              <option key={value} value={value}>
                {formatPeriod(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="basis-40">
          <span className={fieldLabel}>Статус</span>
          <select name="status" defaultValue={status} className={select}>
            <option value="">всички</option>
            {EXPENSE_STATUSES.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <label className="basis-44">
          <span className={fieldLabel}>Категория</span>
          <select name="category" defaultValue={category} className={select}>
            <option value="">всички</option>
            {EXPENSE_CATEGORIES.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex h-8 items-center gap-2 text-xs">
          <input
            type="checkbox"
            name="missing"
            value="1"
            defaultChecked={onlyMissing}
            className="size-4 accent-charcoal"
          />
          само без документ
        </label>

        <div className="flex items-center gap-2">
          <button type="submit" className={button('primary')}>
            Покажи
          </button>
          {filtered && (
            <Link href="/admin/accounting/expenses" className={button('ghost')}>
              Изчисти
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? 'Няма разходи по този филтър' : 'Още няма записани разходи'}
          description={
            filtered
              ? 'Разшири филтъра или изчисти го.'
              : 'Записвай всяка покупка, докато е свежа — восък, опаковки, реклама. Месецът сам ще се събере.'
          }
          action={
            filtered ? (
              <Link href="/admin/accounting/expenses" className={button('secondary')}>
                Изчисти филтрите
              </Link>
            ) : (
              <Link href="/admin/accounting/expenses/new" className={button('primary')}>
                Добави първия разход
              </Link>
            )
          }
        />
      ) : (
        <div className={`${tableWrap} overflow-x-auto`}>
          <table className={table}>
            <thead className="bg-cream-surface/60">
              <tr>
                <th className={th}>Дата</th>
                <th className={th}>Доставчик</th>
                <th className={th}>Категория</th>
                <th className={th}>Документ</th>
                <th className={`${th} text-right`}>Сума</th>
                <th className={th}>Статус</th>
                <th className={`${th} text-right`}>Действие</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((expense) => (
                <tr key={expense.id} className={tr}>
                  <td className={`${td} whitespace-nowrap text-ink-ghost tabular-nums`}>
                    {dateFormat.format(expense.documentDate)}
                  </td>
                  <td className={td}>
                    <span className="block text-ink-primary">{expense.supplier}</span>
                    <span className="block text-ink-ghost tabular-nums">{expense.reference}</span>
                  </td>
                  <td className={td}>{labelOf(EXPENSE_CATEGORIES, expense.category)}</td>
                  <td className={td}>
                    {expense.documentMissing ? (
                      <Badge tone="warning">липсва</Badge>
                    ) : (
                      <span className="text-ink-secondary tabular-nums">
                        {expense.documentNumber || 'налице'}
                      </span>
                    )}
                  </td>
                  <td className={`${td} text-right font-medium whitespace-nowrap tabular-nums`}>
                    {formatMoney(money(expense.totalMinor, expense.currency as Currency), 'bg')}
                  </td>
                  <td className={td}>
                    <Badge tone={STATUS_TONE[expense.status] ?? 'neutral'}>
                      {labelOf(EXPENSE_STATUSES, expense.status)}
                    </Badge>
                  </td>
                  <td className={`${td} text-right`}>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {expense.documentMissing && (
                        <form action={markExpenseDocument}>
                          <input type="hidden" name="id" value={expense.id} />
                          <input type="hidden" name="missing" value="0" />
                          <input type="hidden" name="back" value={back} />
                          <button type="submit" className={button('ghost', 'sm')}>
                            документът е у мен
                          </button>
                        </form>
                      )}
                      {expense.status === 'needs_review' && (
                        <form action={markExpenseStatus}>
                          <input type="hidden" name="id" value={expense.id} />
                          <input type="hidden" name="status" value="ready" />
                          <input type="hidden" name="back" value={back} />
                          <button type="submit" className={button('secondary', 'sm')}>
                            прегледан
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/**
 * The current filter as a URL, so an action can send the admin back to the list
 * they were looking at rather than to an unfiltered one.
 */
function currentHref(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()

  for (const key of ['period', 'status', 'category', 'q', 'missing'] as const) {
    if (params[key]) search.set(key, params[key] as string)
  }

  const query = search.toString()

  return query ? `/admin/accounting/expenses?${query}` : '/admin/accounting/expenses'
}

export { periodOf }
