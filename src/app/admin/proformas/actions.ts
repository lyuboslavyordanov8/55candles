'use server'

import { redirect } from 'next/navigation'

import { requireAdmin } from '@/lib/admin-auth'
import type { InvoiceBuyer } from '@/lib/invoices'
import { PROFORMA_LINE_ROWS, type ProformaFormState } from '@/lib/proforma-form'
import { issueProforma, type RawProformaLine } from '@/lib/proformas'

/**
 * Writing one проформа from the form.
 *
 * `requireAdmin()` is called here and not only in the page that renders the
 * form: a server action is an endpoint, and a check made in the page it happens
 * to be rendered by is not a check.
 *
 * Returns the failure rather than redirecting to it, which is why the form is a
 * Client Component with `useActionState`. A redirect would throw away eight rows
 * of typed lines because a price had a third decimal in it, and an admin who has
 * just done that is the last person who should retype them.
 */

const FIELD_MAX = 200
const NOTE_MAX = 500

export async function createProforma(
  _previous: ProformaFormState,
  formData: FormData
): Promise<ProformaFormState> {
  await requireAdmin()

  const field = (name: string, max = FIELD_MAX) =>
    String(formData.get(name) ?? '')
      .trim()
      .slice(0, max)

  const name = field('buyerName')
  if (!name) return { error: 'Получателят няма име.' }

  const buyer: InvoiceBuyer = {
    name,
    ...optional('company', field('buyerCompany')),
    ...optional('eik', field('buyerEik')),
    ...optional('vatNumber', field('buyerVatNumber')),
    ...optional('accountable', field('buyerAccountable')),
    ...optional('address', field('buyerAddress')),
  }

  const lines: RawProformaLine[] = Array.from({ length: PROFORMA_LINE_ROWS }, (_, index) => ({
    description: field(`line${index}Description`),
    quantity: field(`line${index}Quantity`, 10),
    unitPrice: field(`line${index}Price`, 20),
  }))

  const result = await issueProforma({
    buyer,
    lines,
    note: field('note', NOTE_MAX),
  })

  if (result.status === 'blocked') {
    return {
      error: `Проформа не може да се издаде — липсва конфигурация: ${result.missing.join(', ')}.`,
    }
  }

  if (result.status === 'invalid') {
    return { error: `Провери ${result.reason}.` }
  }

  if (result.status === 'failed') {
    return { error: `${result.reason}. Опитай отново.` }
  }

  redirect(`/admin/proformas/${result.id}`)
}

/**
 * An optional field, present only when filled.
 *
 * `{ eik: '' }` and no `eik` at all are different things on a document: the
 * first prints a label with nothing after it. Same helper as the invoice action.
 */
function optional<K extends string>(key: K, value: string): Record<K, string> | Record<string, never> {
  return value ? ({ [key]: value } as Record<K, string>) : {}
}
