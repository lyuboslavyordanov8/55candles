import 'server-only'

import { desc, eq, sql } from 'drizzle-orm'

import { getDb } from '@/db'
import { proformas, type Proforma } from '@/db/schema'
import { company, formatAddress } from './company'
import { invoiceIssuer, missingSellerDetails, type InvoiceBuyer } from './invoices'
import { CURRENCY, type Currency } from './money'

/**
 * Writing a проформа фактура.
 *
 * Standalone, with no order behind it — which is the whole reason it exists.
 * These are for the enquiries that arrive *before* an order does: a wholesale
 * lot, a custom batch of candles, a company that needs a document to get an
 * internal approval or to pay against. The shop's own checkout has no way to
 * quote such a thing, so the buyer and the lines are typed in by hand.
 *
 * ## What makes it different from `invoices.ts`
 *
 * A проформа is **not an accounting document**. It is an offer to pay, so:
 *
 * - **It takes none of the invoice series.** Its own counter, `'proforma'`, and
 *   its own table. Gaps in this series would be lawful — nothing requires it to
 *   be unbroken — but the number is still minted inside the statement that
 *   stores the row, because that machinery already exists and a tidy series
 *   costs nothing.
 * - **It carries no данъчно събитие** and no sale date. Nothing has been sold.
 * - **Undoing it takes nothing.** No credit note, no counter-document. It simply
 *   expires, which is what `validUntil` is for.
 *
 * What it shares with an invoice is immutability, for a different reason: it was
 * sent to somebody. A wrong проформа is superseded by a new one, never edited.
 *
 * ## The one thing to confirm with the accountant
 *
 * The wording of `KIND_NOTE`, and whether the owner's accountant wants proformas
 * in a series of their own at all. Both are stated on the document, both are
 * conventions rather than statute, and neither is mine to settle — the same
 * treatment `VAT_BASIS` gets in `invoices.ts`.
 *
 * Nothing here is reachable without `requireAdmin()`.
 */

/** Where the money is to be sent. See `proformaBank()`. */
const BANK_VARS = {
  iban: 'COMPANY_IBAN',
  bic: 'COMPANY_BIC',
  bankName: 'COMPANY_BANK',
} as const

/** Digits in the number, matching the invoice series so the two look alike. */
const NUMBER_DIGITS = 10

/**
 * How long the prices on it stand.
 *
 * A quote with no expiry is a price the shop can be held to forever, which for a
 * custom batch of candles is a promise about wax it has not bought yet. Fourteen
 * days is the common courtesy and long enough for a company's payment run.
 */
export const PROFORMA_VALID_DAYS = 14

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MINOR_PER_MAJOR = 100

/**
 * Printed verbatim. The legal difference from a фактура, in one sentence.
 *
 * `[VERIFY WITH ACCOUNTANT]` covers the wording, and stays in this comment
 * rather than in the string: a marker printed on a document sent to a customer
 * is worse than no document, which is the same rule `VAT_BASIS` follows in
 * `invoices.ts`. That a проформа is not an accounting document is settled; how
 * this shop words it is not.
 */
const KIND_NOTE =
  'Проформа фактурата не е данъчен документ и не подлежи на осчетоводяване. ' +
  'След плащане се издава фактура.'

/** Why no ДДС, same basis as `invoices.ts` — the company is not registered. */
const VAT_NOTE = 'Не се начислява ДДС на основание чл. 113, ал. 9 от ЗДДС'

/** A проформа is paid before the goods move, which means by transfer. */
const PAYMENT_NOTE = 'Банков превод по сметката по-долу'

export interface ProformaBank {
  iban: string
  bic: string
  bankName: string
  /** Always the legal entity: the account is the company's, not a person's. */
  holder: string
}

/**
 * The account to be paid into, or `null` while it is not fully configured.
 *
 * All or nothing, deliberately. An IBAN without a BIC or a bank name is a
 * payment instruction a bank may refuse, and a проформа that cannot be paid is
 * worse than no проформа — the customer has to come back and ask.
 */
export function proformaBank(): ProformaBank | null {
  const iban = process.env[BANK_VARS.iban]?.trim()
  const bic = process.env[BANK_VARS.bic]?.trim()
  const bankName = process.env[BANK_VARS.bankName]?.trim()

  if (!iban || !bic || !bankName) return null

  return { iban, bic, bankName, holder: company.legalName }
}

/**
 * What the document still lacks, named so the admin can go and set it.
 *
 * The seller's own details are checked through `invoices.ts`: a проформа carries
 * the same identity, seat and „съставил“ as a фактура, and there is no reason for
 * two answers to the question of whether the shop can put its name on a document.
 */
export function missingProformaDetails(): string[] {
  const missing = [...missingSellerDetails()]

  for (const variable of Object.values(BANK_VARS)) {
    if (!process.env[variable]?.trim()) missing.push(variable)
  }

  return missing
}

export interface ProformaLine {
  description: string
  quantity: number
  unitPriceMinor: number
  lineTotalMinor: number
}

/** One row of the form, before anything has been believed about it. */
export interface RawProformaLine {
  description: string
  quantity: string
  unitPrice: string
}

export type ParsedLines =
  | { status: 'ok'; lines: ProformaLine[] }
  | { status: 'invalid'; reason: string }

/** A whole positive count of things. Not `1.5`, not `1e3`, not `0`. */
function parseQuantity(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null

  const quantity = Number(value)

  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null
}

/**
 * Major units as typed, to minor units. `null` for anything that is not money.
 *
 * A comma is accepted for the decimal point because that is what a Bulgarian
 * keyboard produces, and rounding is refused rather than performed: `9.505`
 * means the person typing it has a third decimal in mind, and a проформа is not
 * the place to decide which way it goes.
 */
function parsePriceMinor(value: string): number | null {
  const normalised = value.trim().replace(',', '.')

  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null

  // Multiplying a two-decimal string in floating point ("9.50" * 100 = 949.99…),
  // so the digits are assembled instead of scaled.
  const [major, minor = ''] = normalised.split('.')

  return Number(major) * MINOR_PER_MAJOR + Number(minor.padEnd(2, '0'))
}

/**
 * The typed rows to lines, or a reason the document cannot be written.
 *
 * Blank rows are dropped, because the form always carries a few spare ones. A
 * *partly* filled row is refused instead: it means something was meant and the
 * only honest options are to ask or to guess.
 */
export function parseProformaLines(raw: readonly RawProformaLine[]): ParsedLines {
  const lines: ProformaLine[] = []

  for (const candidate of raw) {
    const description = candidate.description.trim()
    const quantity = candidate.quantity.trim()
    const unitPrice = candidate.unitPrice.trim()

    if (!description && !quantity && !unitPrice) continue

    if (!description) return { status: 'invalid', reason: 'ред без описание' }

    const count = parseQuantity(quantity)
    if (count === null) return { status: 'invalid', reason: `количеството на „${description}“` }

    const unitPriceMinor = parsePriceMinor(unitPrice)
    if (unitPriceMinor === null) return { status: 'invalid', reason: `цената на „${description}“` }

    lines.push({
      description,
      quantity: count,
      unitPriceMinor,
      lineTotalMinor: unitPriceMinor * count,
    })
  }

  if (lines.length === 0) return { status: 'invalid', reason: 'проформа без редове' }

  return { status: 'ok', lines }
}

/**
 * The document, exactly as issued.
 *
 * Amounts stay integer minor units, and the total is computed here rather than
 * accepted from anywhere: the only total that can be reconciled against the
 * lines is the one added up from them. `version` is here so a reader added in two
 * years knows which shape it is looking at.
 */
export interface ProformaSnapshot {
  version: 1
  number: string
  issuedAt: string
  validUntil: string
  seller: {
    legalName: string
    eik: string
    vatNumber: string | null
    address: string
    city: string
    email: string
    tradingName: string
  }
  bank: ProformaBank
  buyer: InvoiceBuyer
  lines: readonly ProformaLine[]
  money: {
    currency: Currency
    totalMinor: number
  }
  /** That this is not an accounting document. Printed verbatim. */
  kindNote: string
  vatNote: string
  paymentNote: string
  /** Whatever the admin wanted the customer to read. Absent when nothing. */
  note?: string
  issuedBy: string
}

/**
 * Build the document. Pure, so this is the part the tests hold.
 *
 * `number` is passed in rather than read here, for the same reason as an
 * invoice's: it comes from the statement that stores the row.
 */
export function proformaSnapshot(input: {
  number: string
  issuedAt: Date
  issuedBy: string
  bank: ProformaBank
  buyer: InvoiceBuyer
  lines: readonly ProformaLine[]
  note?: string
}): ProformaSnapshot {
  const { number, issuedAt, issuedBy, bank, buyer, lines, note } = input
  const trimmedNote = note?.trim()

  return {
    version: 1,
    number,
    issuedAt: issuedAt.toISOString(),
    validUntil: new Date(issuedAt.getTime() + PROFORMA_VALID_DAYS * MS_PER_DAY).toISOString(),
    seller: {
      legalName: company.legalName,
      eik: company.eik,
      vatNumber: company.vatNumber,
      address: formatAddress('bg'),
      city: company.address.city,
      email: company.contact.email,
      tradingName: company.tradingName,
    },
    bank,
    buyer: prunedBuyer(buyer),
    lines,
    money: {
      currency: CURRENCY,
      totalMinor: lines.reduce((total, line) => total + line.lineTotalMinor, 0),
    },
    kindNote: KIND_NOTE,
    vatNote: VAT_NOTE,
    paymentNote: PAYMENT_NOTE,
    ...(trimmedNote ? { note: trimmedNote } : {}),
    issuedBy,
  }
}

/**
 * Drop the blank optional fields rather than storing `''`.
 *
 * The renderer shows a row per field the buyer block has, so an empty string
 * prints `ЕИК:` followed by nothing — which reads as a detail somebody forgot.
 * Same treatment as `invoices.ts` gives its own buyer.
 */
function prunedBuyer(buyer: InvoiceBuyer): InvoiceBuyer {
  const text = (value: string | undefined) => value?.trim() || undefined

  return {
    name: buyer.name.trim(),
    ...(text(buyer.company) ? { company: text(buyer.company) } : {}),
    ...(text(buyer.eik) ? { eik: text(buyer.eik) } : {}),
    ...(text(buyer.vatNumber) ? { vatNumber: text(buyer.vatNumber) } : {}),
    ...(text(buyer.accountable) ? { accountable: text(buyer.accountable) } : {}),
    ...(text(buyer.address) ? { address: text(buyer.address) } : {}),
  }
}

export type ProformaOutcome =
  | { status: 'ok'; id: string; number: string }
  /** The seller's details or the bank account are not complete enough. */
  | { status: 'blocked'; missing: string[] }
  | { status: 'invalid'; reason: string }
  | { status: 'failed'; reason: string }

/**
 * Write one проформа and hand back where it lives.
 *
 * The number and the row appear together or not at all — one statement, the
 * counter bumped in a CTE, exactly as `issueInvoiceForOrder()` does it and for
 * the same reason. Here it buys tidiness rather than lawfulness, but the shape
 * of the problem is identical and so is the solution.
 */
export async function issueProforma(input: {
  buyer: InvoiceBuyer
  lines: readonly RawProformaLine[]
  note?: string
}): Promise<ProformaOutcome> {
  const missing = missingProformaDetails()
  if (missing.length > 0) return { status: 'blocked', missing }

  const bank = proformaBank()
  const issuer = invoiceIssuer()

  // `missingProformaDetails()` has established both; narrowing, not re-checking.
  if (!bank || !issuer) return { status: 'blocked', missing: missingProformaDetails() }

  if (!input.buyer.name.trim()) return { status: 'invalid', reason: 'получател без име' }

  const parsed = parseProformaLines(input.lines)
  if (parsed.status === 'invalid') return parsed

  const issuedAt = new Date()

  // Built with a placeholder number and corrected in SQL — nothing reads this
  // copy of the field, `jsonb_set` overwrites it.
  const snapshot = proformaSnapshot({
    number: '',
    issuedAt,
    issuedBy: issuer,
    bank,
    buyer: input.buyer,
    lines: parsed.lines,
    note: input.note,
  })

  try {
    const inserted = await getDb().execute<{ id: string; number: string }>(sql`
      with bumped as (
        insert into document_counters (name, value, updated_at)
        values ('proforma', 1, now())
        on conflict (name) do update
          set value = document_counters.value + 1, updated_at = now()
        returning value
      ),
      minted as (
        select lpad(value::text, ${sql.raw(String(NUMBER_DIGITS))}, '0') as number from bumped
      )
      insert into proformas (number, issued_at, valid_until, total_minor, currency, snapshot)
      select
        minted.number,
        ${issuedAt.toISOString()}::timestamptz,
        ${snapshot.validUntil}::timestamptz,
        ${snapshot.money.totalMinor},
        ${snapshot.money.currency},
        jsonb_set(${JSON.stringify(snapshot)}::jsonb, '{number}', to_jsonb(minted.number))
      from minted
      returning id, number
    `)

    const row = inserted.rows[0]

    if (!row?.id || !row.number) {
      console.error('[proformas] insert returned no row')

      return { status: 'failed', reason: 'проформата не беше записана' }
    }

    return { status: 'ok', id: String(row.id), number: String(row.number) }
  } catch (error) {
    console.error('[proformas] insert failed', error)

    return { status: 'failed', reason: 'проформата не беше записана' }
  }
}

export async function getProforma(id: string): Promise<Proforma | null> {
  const [found] = await getDb().select().from(proformas).where(eq(proformas.id, id)).limit(1)

  return found ?? null
}

/** Newest first: the one just written is the one being looked for. */
export async function listProformas(limit = 100): Promise<Proforma[]> {
  return getDb().select().from(proformas).orderBy(desc(proformas.issuedAt)).limit(limit)
}

/**
 * A stored snapshot, or `null` when it is not a shape this version knows.
 *
 * Read rather than cast, because the column is `jsonb` and the row may have been
 * written by an older build. The page says so instead of rendering a document
 * with holes in it — same contract as `readSnapshot` in `invoices.ts`.
 */
export function readProformaSnapshot(value: unknown): ProformaSnapshot | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<ProformaSnapshot>

  if (candidate.version !== 1) return null
  if (typeof candidate.number !== 'string' || !candidate.bank || !candidate.money) return null
  if (!Array.isArray(candidate.lines)) return null

  return candidate as ProformaSnapshot
}
