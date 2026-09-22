/**
 * The shape of the проформа form, shared by the action and the form itself.
 *
 * Its own module, and deliberately *not* `server-only`, because both sides need
 * it: a `'use server'` file may export nothing but async functions, and
 * `src/lib/proformas.ts` is server-only and would refuse to be imported by a
 * Client Component. So the two constants that describe the form live here, where
 * either side may read them.
 */

/**
 * How many line rows the form offers.
 *
 * Fixed, because adding rows on demand needs script and eight lines cover a
 * custom batch of candles. The rows left empty are dropped — see
 * `parseProformaLines`.
 */
export const PROFORMA_LINE_ROWS = 8

/** What the form shows after a failed attempt. `null` before the first one. */
export type ProformaFormState = { error: string } | null
