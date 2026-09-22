import 'server-only'

import { eq } from 'drizzle-orm'

import { getDb } from '@/db'
import { accountantSettings } from '@/db/schema'
import { company, formatAddress } from '../company'
import { proformaBank } from '../proformas'
import { recordAccountingEvent } from './audit'
import { ACCOUNTANT_REQUIREMENTS, availableRequirements, vatState } from './config'

/**
 * Who the accountant is, and what the company's own details are.
 *
 * Two very different things in one module because they answer one screen, and
 * because the *difference* between them is the thing worth stating:
 *
 * - **The company's details are not editable here and never will be.** They live
 *   in `src/lib/company.ts` and in the bank environment variables, they are on
 *   the impressum, on every invoice and in the Търговски регистър, and a second
 *   copy in a settings table is how an invoice ends up with an address the
 *   company no longer has. This module *reads* them.
 * - **The accountant is data the owner edits.** A new accountant should not need
 *   a deploy, and nothing else in the system depends on their name.
 *
 * `companyProfile()` returns only the fields the admin actually displays. The
 * environment is never handed to the browser — not the object, not a subset, not
 * a debug route.
 */

const SETTINGS_ID = 'default'

export interface CompanyProfile {
  legalName: string
  eik: string
  vatRegistered: boolean
  vatNumber: string | null
  address: string
  email: string
  /** `null` while the bank variables are not configured. */
  bank: { iban: string; bic: string; bankName: string; holder: string } | null
  /** The manager's name, when the company publishes one. */
  manager: string | null
  /** Where each of these is maintained, so the screen can say so. */
  source: string
}

export function companyProfile(): CompanyProfile {
  const vat = vatState()
  const bank = proformaBank()

  return {
    legalName: company.legalName,
    eik: company.eik,
    vatRegistered: vat.registered,
    vatNumber: vat.number,
    address: formatAddress('bg'),
    email: company.contact.email,
    bank,
    manager: company.manager,
    source: 'src/lib/company.ts и променливите на средата',
  }
}

export interface AccountantSettings {
  name: string
  email: string
  note: string
  /** Requirement keys this accountant wants. Defaults to everything available. */
  requirements: string[]
  updatedAt: Date | null
  updatedBy: string
}

/**
 * The accountant, or the defaults.
 *
 * An unset `requirements` is read as "everything the shop can produce" rather
 * than as an empty list: a fresh install should offer a working monthly package,
 * not an export with nothing in it.
 */
export async function accountantSettingsFor(): Promise<AccountantSettings> {
  const [row] = await getDb()
    .select()
    .from(accountantSettings)
    .where(eq(accountantSettings.id, SETTINGS_ID))
    .limit(1)

  const stored = Array.isArray(row?.requirements) ? (row.requirements as unknown[]) : null
  const keys = stored
    ?.filter((value): value is string => typeof value === 'string')
    .filter((key) => ACCOUNTANT_REQUIREMENTS.some((requirement) => requirement.key === key))

  return {
    name: row?.name ?? '',
    email: row?.email ?? '',
    note: row?.note ?? '',
    requirements: keys?.length ? keys : availableRequirements().map((entry) => entry.key),
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? '',
  }
}

export async function saveAccountantSettings(
  input: { name: string; email: string; note: string; requirements: string[] },
  actor: string
): Promise<boolean> {
  // Only keys this build knows, and only ones the shop can actually produce: a
  // checklist item nothing can satisfy would block every month forever.
  const requirements = input.requirements.filter((key) =>
    availableRequirements().some((entry) => entry.key === key)
  )

  const values = {
    name: input.name.trim().slice(0, 200),
    email: input.email.trim().slice(0, 200),
    note: input.note.trim().slice(0, 1000),
    requirements,
    updatedAt: new Date(),
    updatedBy: actor,
  }

  try {
    await getDb()
      .insert(accountantSettings)
      .values({ id: SETTINGS_ID, ...values })
      .onConflictDoUpdate({ target: accountantSettings.id, set: values })

    await recordAccountingEvent({
      action: 'settings.saved',
      entity: 'settings',
      entityId: SETTINGS_ID,
      actor,
      detail: { requirements },
    })

    return true
  } catch (error) {
    console.error('[accounting] accountant settings not saved', error)

    return false
  }
}
