import 'server-only'

import { and, desc, eq } from 'drizzle-orm'

import { getDb } from '@/db'
import { accountingEvents, type AccountingEvent } from '@/db/schema'

/**
 * What was done to the books.
 *
 * Append-only and narrow: the events that change what an accountant would see,
 * and nothing else. A log of every page view is a log nobody reads, and this one
 * has to stay readable — it is what answers "who marked September ready" three
 * months after the fact.
 *
 * Writing an event **never fails the action it records.** A purchase that saved
 * but whose audit row did not is a bookkeeping annoyance; an expense the owner
 * typed on a phone and lost because the log was unavailable is worse. So the
 * write is best-effort and says so loudly in the server log when it does not
 * land.
 */

export interface AccountingEventInput {
  action: string
  entity: 'expense' | 'period' | 'export' | 'settings' | 'invoice'
  entityId?: string
  /** `YYYY-MM`, when the event belongs to a month. */
  period?: string
  actor: string
  detail?: Record<string, unknown>
}

export async function recordAccountingEvent(input: AccountingEventInput): Promise<void> {
  try {
    await getDb()
      .insert(accountingEvents)
      .values({
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? '',
        period: input.period ?? '',
        actor: input.actor,
        detail: input.detail ?? null,
      })
  } catch (error) {
    // Deliberately swallowed — see the module docblock. Loud, so a log that has
    // stopped recording does not do it quietly.
    console.error('[accounting] audit event not recorded', input.action, error)
  }
}

/** The month's events, newest first. */
export async function listAccountingEvents(
  filter: { period?: string; entity?: string } = {},
  limit = 100
): Promise<AccountingEvent[]> {
  const clauses = []

  if (filter.period) clauses.push(eq(accountingEvents.period, filter.period))
  if (filter.entity) clauses.push(eq(accountingEvents.entity, filter.entity))

  return getDb()
    .select()
    .from(accountingEvents)
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(desc(accountingEvents.createdAt))
    .limit(limit)
}

/**
 * Whether anything the accountant would care about happened after a given
 * moment — which is how "your export may be out of date" is answered without
 * storing a second copy of the month to compare against.
 */
export async function changedSince(period: string, since: Date): Promise<AccountingEvent[]> {
  const events = await listAccountingEvents({ period }, 200)

  return events.filter(
    (event) => event.createdAt > since && !event.action.startsWith('export.')
  )
}
