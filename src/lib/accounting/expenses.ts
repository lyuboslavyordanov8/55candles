import 'server-only'

import { and, desc, eq, gte, ilike, lt, or, sql } from 'drizzle-orm'

import { getDb } from '@/db'
import { expenses, type Expense } from '@/db/schema'
import { CURRENCY } from '../money'
import { recordAccountingEvent } from './audit'
import { periodBounds, periodOf } from './period-key'
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, EXPENSE_STATUSES, isKnownKey } from './vocabulary'

/**
 * The shop's own purchases.
 *
 * The only money record in the system a human types in — orders arrive by
 * themselves — so the whole module is built around *how little* is needed to
 * save one: a supplier, a date, a total and a category. Everything else is
 * optional and can be filled in when the document is in hand, because an expense
 * remembered badly beats an expense not entered at all.
 *
 * ## What is deliberately not here
 *
 * **The document itself.** Storing a photo needs a blob store this project does
 * not have, so `documentMissing` records whether one exists and the monthly
 * close counts the ones that do not. When storage is added, the file joins the
 * row; nothing about the shape below has to change to allow it.
 *
 * **Any judgement about tax.** `vatShownMinor` is what the supplier's document
 * says, recorded because it is part of that document, and it is never presented
 * as recoverable — this company is not ДДС registered and whether that changes
 * anything is the accountant's question.
 *
 * Nothing here is reachable without `requireAdmin()`.
 */

const REFERENCE_DIGITS = 4
const MINOR_PER_MAJOR = 100

export interface ExpenseInput {
  supplier: string
  supplierEik?: string
  documentNumber?: string
  /** `YYYY-MM-DD`, as the date input gives it. */
  documentDate: string
  category: string
  description?: string
  /** Major units as typed. Comma or point. */
  total: string
  net?: string
  vatShown?: string
  paymentMethod: string
  documentMissing: boolean
  note?: string
}

export type ParsedExpense = {
  supplier: string
  supplierEik: string
  documentNumber: string
  documentDate: Date
  category: string
  description: string
  totalMinor: number
  netMinor: number | null
  vatShownMinor: number | null
  paymentMethod: string
  documentMissing: boolean
  note: string
  period: string
}

export type ExpenseParse =
  | { status: 'ok'; expense: ParsedExpense }
  | { status: 'invalid'; field: keyof ExpenseInput; reason: string }

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Major units as typed, to minor. `null` for anything that is not money.
 *
 * A comma is accepted because that is what a Bulgarian keyboard produces, and a
 * third decimal is refused rather than rounded — the same rule the проформа
 * lines follow, and for the same reason: the person typing has something in mind
 * and this is not the place to decide it for them.
 */
function parseAmountMinor(value: string): number | null {
  const normalised = value.trim().replace(/\s/g, '').replace(',', '.')

  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null

  const [major, minor = ''] = normalised.split('.')

  return Number(major) * MINOR_PER_MAJOR + Number(minor.padEnd(2, '0'))
}

/**
 * One typed expense, checked. Pure, so this is the part the tests hold.
 *
 * Returns the offending field rather than a sentence, so the form can mark the
 * input as well as say what is wrong — a message under a form with nine fields
 * is a hunt.
 */
export function parseExpense(input: ExpenseInput): ExpenseParse {
  const supplier = input.supplier.trim()
  if (!supplier) return { status: 'invalid', field: 'supplier', reason: 'Кой е доставчикът?' }

  if (!DATE_PATTERN.test(input.documentDate)) {
    return { status: 'invalid', field: 'documentDate', reason: 'Датата на документа липсва.' }
  }

  // Midday, not midnight: the date is a calendar day and storing it at noon in
  // Sofia keeps it on that day in every zone a reader might format it in.
  const documentDate = new Date(`${input.documentDate}T12:00:00.000Z`)
  if (Number.isNaN(documentDate.getTime())) {
    return { status: 'invalid', field: 'documentDate', reason: 'Датата не е валидна.' }
  }

  if (!isKnownKey(EXPENSE_CATEGORIES, input.category)) {
    return { status: 'invalid', field: 'category', reason: 'Избери категория.' }
  }

  if (!isKnownKey(EXPENSE_PAYMENT_METHODS, input.paymentMethod)) {
    return { status: 'invalid', field: 'paymentMethod', reason: 'Избери начин на плащане.' }
  }

  const totalMinor = parseAmountMinor(input.total)
  if (totalMinor === null) {
    return { status: 'invalid', field: 'total', reason: 'Сумата не е число — напр. 86,40.' }
  }

  const netMinor = input.net?.trim() ? parseAmountMinor(input.net) : null
  if (input.net?.trim() && netMinor === null) {
    return { status: 'invalid', field: 'net', reason: 'Сумата без ДДС не е число.' }
  }

  const vatShownMinor = input.vatShown?.trim() ? parseAmountMinor(input.vatShown) : null
  if (input.vatShown?.trim() && vatShownMinor === null) {
    return { status: 'invalid', field: 'vatShown', reason: 'ДДС-то от документа не е число.' }
  }

  // Only checked when both halves were given: a document that shows net and VAT
  // has to add up to what was paid, and a mistyped digit here is a figure the
  // accountant would have to chase back to the paper.
  if (netMinor !== null && vatShownMinor !== null && netMinor + vatShownMinor !== totalMinor) {
    return {
      status: 'invalid',
      field: 'net',
      reason: 'Без ДДС + ДДС не дава общата сума.',
    }
  }

  return {
    status: 'ok',
    expense: {
      supplier,
      supplierEik: input.supplierEik?.trim() ?? '',
      documentNumber: input.documentNumber?.trim() ?? '',
      documentDate,
      category: input.category,
      description: input.description?.trim() ?? '',
      totalMinor,
      netMinor,
      vatShownMinor,
      paymentMethod: input.paymentMethod,
      documentMissing: input.documentMissing,
      note: input.note?.trim() ?? '',
      period: periodOf(documentDate),
    },
  }
}

export type ExpenseOutcome =
  | { status: 'ok'; id: string; reference: string; period: string }
  | { status: 'invalid'; field: keyof ExpenseInput; reason: string }
  | { status: 'failed'; reason: string }

/**
 * Save one expense.
 *
 * The reference is minted in the same statement that stores the row, the way the
 * invoice and проформа series are — not because gaps matter here (they do not;
 * `EXP-0007` is a handle, not a legal number) but because the machinery exists
 * and two admins on two phones should not both be handed `EXP-0007`.
 */
export async function createExpense(input: ExpenseInput, actor: string): Promise<ExpenseOutcome> {
  const parsed = parseExpense(input)
  if (parsed.status === 'invalid') return parsed

  const expense = parsed.expense

  try {
    const inserted = await getDb().execute<{ id: string; reference: string }>(sql`
      with bumped as (
        insert into document_counters (name, value, updated_at)
        values ('expense', 1, now())
        on conflict (name) do update
          set value = document_counters.value + 1, updated_at = now()
        returning value
      ),
      minted as (
        select 'EXP-' || lpad(value::text, ${sql.raw(String(REFERENCE_DIGITS))}, '0') as reference
        from bumped
      )
      insert into expenses (
        reference, supplier, supplier_eik, document_number, document_date, category,
        description, net_minor, vat_shown_minor, total_minor, currency, payment_method,
        status, document_missing, period, note, created_by
      )
      select
        minted.reference,
        ${expense.supplier},
        ${expense.supplierEik},
        ${expense.documentNumber},
        ${expense.documentDate.toISOString()}::timestamptz,
        ${expense.category},
        ${expense.description},
        ${expense.netMinor},
        ${expense.vatShownMinor},
        ${expense.totalMinor},
        ${CURRENCY},
        ${expense.paymentMethod},
        'needs_review',
        ${expense.documentMissing},
        ${expense.period},
        ${expense.note},
        ${actor}
      from minted
      returning id, reference
    `)

    const row = inserted.rows[0]

    if (!row?.id) {
      console.error('[accounting] expense insert returned no row')

      return { status: 'failed', reason: 'разходът не беше записан' }
    }

    await recordAccountingEvent({
      action: 'expense.created',
      entity: 'expense',
      entityId: String(row.id),
      period: expense.period,
      actor,
      detail: {
        reference: String(row.reference),
        supplier: expense.supplier,
        totalMinor: expense.totalMinor,
        documentMissing: expense.documentMissing,
      },
    })

    return {
      status: 'ok',
      id: String(row.id),
      reference: String(row.reference),
      period: expense.period,
    }
  } catch (error) {
    console.error('[accounting] expense insert failed', error)

    return { status: 'failed', reason: 'разходът не беше записан' }
  }
}

export interface ExpenseFilter {
  period?: string
  status?: string
  category?: string
  /** Matches supplier, document number or reference. */
  query?: string
  missingDocument?: boolean
}

/** Newest document first: the one just entered is the one being looked for. */
export async function listExpenses(filter: ExpenseFilter = {}, limit = 200): Promise<Expense[]> {
  const clauses = []

  if (filter.period) clauses.push(eq(expenses.period, filter.period))
  if (filter.status) clauses.push(eq(expenses.status, filter.status))
  if (filter.category) clauses.push(eq(expenses.category, filter.category))
  if (filter.missingDocument !== undefined) {
    clauses.push(eq(expenses.documentMissing, filter.missingDocument))
  }

  const query = filter.query?.trim()
  if (query) {
    const term = `%${query}%`
    clauses.push(
      or(
        ilike(expenses.supplier, term),
        ilike(expenses.documentNumber, term),
        ilike(expenses.reference, term),
        ilike(expenses.supplierEik, term)
      )
    )
  }

  const where = clauses.length ? and(...clauses) : undefined

  return getDb()
    .select()
    .from(expenses)
    .where(where)
    .orderBy(desc(expenses.documentDate), desc(expenses.createdAt))
    .limit(limit)
}

export async function getExpense(id: string): Promise<Expense | null> {
  const [found] = await getDb().select().from(expenses).where(eq(expenses.id, id)).limit(1)

  return found ?? null
}

export interface ExpenseTotals {
  count: number
  totalMinor: number
  missingDocuments: number
  needsReview: number
}

/** What a month's expenses add up to. One query, because the close asks on load. */
export async function expenseTotals(period: string): Promise<ExpenseTotals> {
  const [row] = await getDb()
    .select({
      count: sql<number>`count(*)::int`,
      totalMinor: sql<number>`coalesce(sum(${expenses.totalMinor}), 0)::int`,
      missingDocuments: sql<number>`count(*) filter (where ${expenses.documentMissing})::int`,
      needsReview: sql<number>`count(*) filter (where ${expenses.status} = 'needs_review')::int`,
    })
    .from(expenses)
    .where(eq(expenses.period, period))

  return {
    count: Number(row?.count ?? 0),
    totalMinor: Number(row?.totalMinor ?? 0),
    missingDocuments: Number(row?.missingDocuments ?? 0),
    needsReview: Number(row?.needsReview ?? 0),
  }
}

export type ExpenseUpdate =
  | { kind: 'status'; status: string }
  | { kind: 'document'; missing: boolean }
  | { kind: 'note'; note: string }

/**
 * The three edits the workflow needs, and nothing else.
 *
 * Not a general update: the amounts and the supplier are what the document says,
 * and a screen that lets them be retyped casually is how a figure drifts away
 * from the paper behind it. Correcting those means deleting the row and entering
 * it again, which leaves both events in the audit trail.
 */
export async function updateExpense(
  id: string,
  update: ExpenseUpdate,
  actor: string
): Promise<boolean> {
  const db = getDb()
  const existing = await getExpense(id)
  if (!existing) return false

  const changes =
    update.kind === 'status'
      ? { status: update.status }
      : update.kind === 'document'
        ? { documentMissing: update.missing }
        : { note: update.note }

  if (update.kind === 'status' && !isKnownKey(EXPENSE_STATUSES, update.status)) return false

  await db
    .update(expenses)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(expenses.id, id))

  await recordAccountingEvent({
    action: `expense.${update.kind}`,
    entity: 'expense',
    entityId: id,
    period: existing.period,
    actor,
    detail: { reference: existing.reference, ...changes },
  })

  return true
}

/**
 * Delete one expense.
 *
 * Allowed, unlike an invoice: an expense is the shop's own note about its own
 * purchase, not a document issued to anybody. The audit row outlives it — that
 * is why `accounting_events` holds a loose id rather than a foreign key.
 */
export async function deleteExpense(id: string, actor: string): Promise<boolean> {
  const existing = await getExpense(id)
  if (!existing) return false

  await getDb().delete(expenses).where(eq(expenses.id, id))

  await recordAccountingEvent({
    action: 'expense.deleted',
    entity: 'expense',
    entityId: id,
    period: existing.period,
    actor,
    detail: {
      reference: existing.reference,
      supplier: existing.supplier,
      totalMinor: existing.totalMinor,
    },
  })

  return true
}

/**
 * Expenses across a date range, for the rolling views that are not one month.
 *
 * Bounds rather than the stored `period` string, so a window that starts
 * mid-month is possible without a second column.
 */
export async function expensesBetween(start: Date, end: Date): Promise<Expense[]> {
  return getDb()
    .select()
    .from(expenses)
    .where(and(gte(expenses.documentDate, start), lt(expenses.documentDate, end)))
    .orderBy(desc(expenses.documentDate))
}

/** The bounds of a month, re-exported so callers need one import for a period. */
export { periodBounds }
