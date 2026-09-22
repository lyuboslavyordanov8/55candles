import type { ExpenseInput } from './expenses'

/**
 * The shape of the expense form, shared by the action and the form.
 *
 * Its own module, and not `server-only`, for the same reason `proforma-form.ts`
 * is: a `'use server'` file may export nothing but async functions, and
 * `expenses.ts` is server-only and would refuse to be imported by a Client
 * Component.
 */

export type ExpenseFormState = {
  error: string
  /** Which input to mark, when the failure belongs to one. */
  field?: keyof ExpenseInput
} | null
