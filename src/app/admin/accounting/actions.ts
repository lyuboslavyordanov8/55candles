'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireAdmin } from '@/lib/admin-auth'
import { recordAccountingEvent } from '@/lib/accounting/audit'
import {
  createExpense,
  deleteExpense,
  updateExpense,
  type ExpenseInput,
} from '@/lib/accounting/expenses'
import { isPeriodKey } from '@/lib/accounting/period-key'
import { setPeriodNote, setPeriodStatus } from '@/lib/accounting/periods'
import { saveAccountantSettings } from '@/lib/accounting/settings'
import type { ExpenseFormState } from '@/lib/accounting/expense-form'

/**
 * Everything the accounting screens write.
 *
 * `requireAdmin()` opens every one of them. A server action is an endpoint, and
 * a check made in the page that happens to render the form is not a check —
 * these actions are reachable by anything that can post.
 *
 * The expense action returns its failure instead of redirecting, so a form typed
 * on a phone survives a rejected amount. The rest redirect, because they are
 * single-click operations with nothing to lose.
 */

const FIELD_MAX = 200

function field(formData: FormData, name: string, max = FIELD_MAX): string {
  return String(formData.get(name) ?? '')
    .trim()
    .slice(0, max)
}

export async function saveExpense(
  _previous: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const actor = await requireAdmin()

  const input: ExpenseInput = {
    supplier: field(formData, 'supplier'),
    supplierEik: field(formData, 'supplierEik', 40),
    documentNumber: field(formData, 'documentNumber', 60),
    documentDate: field(formData, 'documentDate', 10),
    category: field(formData, 'category', 40),
    description: field(formData, 'description'),
    total: field(formData, 'total', 20),
    net: field(formData, 'net', 20),
    vatShown: field(formData, 'vatShown', 20),
    paymentMethod: field(formData, 'paymentMethod', 20),
    // The checkbox says the document *is* in hand; the column records the
    // opposite, because "missing" is what the monthly close counts.
    documentMissing: formData.get('documentInHand') !== 'on',
    note: field(formData, 'note', 500),
  }

  const result = await createExpense(input, actor)

  if (result.status === 'invalid') {
    return { error: result.reason, field: result.field }
  }

  if (result.status === 'failed') {
    return { error: `${result.reason}. Опитай отново.` }
  }

  revalidatePath('/admin/accounting')
  revalidatePath('/admin/accounting/expenses')

  redirect(`/admin/accounting/expenses?period=${result.period}&saved=${result.reference}`)
}

export async function markExpenseStatus(formData: FormData): Promise<void> {
  const actor = await requireAdmin()

  const id = field(formData, 'id', 60)
  const status = field(formData, 'status', 40)
  if (!id || !status) redirect('/admin/accounting/expenses')

  await updateExpense(id, { kind: 'status', status }, actor)

  revalidatePath('/admin/accounting/expenses')
  redirect(field(formData, 'back', 300) || '/admin/accounting/expenses')
}

export async function markExpenseDocument(formData: FormData): Promise<void> {
  const actor = await requireAdmin()

  const id = field(formData, 'id', 60)
  if (!id) redirect('/admin/accounting/expenses')

  await updateExpense(id, { kind: 'document', missing: field(formData, 'missing') === '1' }, actor)

  revalidatePath('/admin/accounting')
  revalidatePath('/admin/accounting/expenses')
  redirect(field(formData, 'back', 300) || '/admin/accounting/expenses')
}

export async function removeExpense(formData: FormData): Promise<void> {
  const actor = await requireAdmin()

  const id = field(formData, 'id', 60)
  if (!id) redirect('/admin/accounting/expenses')

  await deleteExpense(id, actor)

  revalidatePath('/admin/accounting')
  revalidatePath('/admin/accounting/expenses')
  redirect('/admin/accounting/expenses?deleted=1')
}

export async function advancePeriod(formData: FormData): Promise<void> {
  const actor = await requireAdmin()

  const period = field(formData, 'period', 7)
  const status = field(formData, 'status', 20)
  if (!isPeriodKey(period)) redirect('/admin/accounting')

  const result = await setPeriodStatus(period, status, actor, {
    override: formData.get('override') === 'on',
  })

  revalidatePath('/admin/accounting')
  revalidatePath(`/admin/accounting/periods/${period}`)

  if (result.status === 'blocked') {
    redirect(`/admin/accounting/periods/${period}?error=blocked`)
  }

  redirect(
    result.status === 'ok'
      ? `/admin/accounting/periods/${period}?moved=${status}`
      : `/admin/accounting/periods/${period}?error=failed`
  )
}

export async function savePeriodNote(formData: FormData): Promise<void> {
  const actor = await requireAdmin()

  const period = field(formData, 'period', 7)
  if (!isPeriodKey(period)) redirect('/admin/accounting')

  await setPeriodNote(period, field(formData, 'note', 1000), actor)

  revalidatePath(`/admin/accounting/periods/${period}`)
  redirect(`/admin/accounting/periods/${period}?noted=1`)
}

/**
 * Record that a package was prepared.
 *
 * The files themselves are downloaded from the export routes; this marks the
 * moment, which is what „данните се промениха след последния пакет“ compares
 * against. No file is stored, so nothing here can overwrite a previous export —
 * the audit trail keeps every one of them.
 */
export async function markPackagePrepared(formData: FormData): Promise<void> {
  const actor = await requireAdmin()

  const period = field(formData, 'period', 7)
  if (!isPeriodKey(period)) redirect('/admin/accounting')

  await recordAccountingEvent({
    action: 'export.created',
    entity: 'export',
    entityId: period,
    period,
    actor,
    detail: { files: field(formData, 'files', 500) },
  })

  await setPeriodStatus(period, 'exported', actor, { override: true })

  revalidatePath('/admin/accounting')
  revalidatePath(`/admin/accounting/periods/${period}`)
  redirect(`/admin/accounting/periods/${period}?exported=1`)
}

export async function saveAccountant(formData: FormData): Promise<void> {
  const actor = await requireAdmin()

  await saveAccountantSettings(
    {
      name: field(formData, 'name'),
      email: field(formData, 'email'),
      note: field(formData, 'note', 1000),
      requirements: formData.getAll('requirements').map((value) => String(value).slice(0, 40)),
    },
    actor
  )

  revalidatePath('/admin/accounting/settings')
  redirect('/admin/accounting/settings?saved=1')
}
