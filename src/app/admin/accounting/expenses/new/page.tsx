import { requireAdmin } from '@/lib/admin-auth'
import ExpenseForm from '@/components/admin/ExpenseForm'
import { PageHeader } from '@/components/admin/ui'

/**
 * Adding one expense.
 *
 * The date defaults to today in Sofia, computed here rather than in the browser:
 * a Client Component reading `new Date()` would render the server's day first and
 * the browser's day a moment later, and a date field that changes under the
 * cursor is a date field nobody trusts.
 */

export const metadata = {
  title: 'Нов разход',
  robots: { index: false, follow: false, nocache: true },
}

/** Today in Sofia as `YYYY-MM-DD`, which is what a `date` input wants. */
function todayInSofia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default async function NewExpensePage() {
  await requireAdmin()

  return (
    <>
      <PageHeader
        title="Нов разход"
        back={{ href: '/admin/accounting/expenses', label: 'разходи' }}
        description="Доставчик, дата, сума, категория — това стига. Останалото може и по-късно."
      />

      <ExpenseForm defaultDate={todayInSofia()} />
    </>
  )
}
