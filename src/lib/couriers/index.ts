import 'server-only'

import type { Courier } from '../shipping'
import { createEcontClient } from './econt'
import type { CourierClient, LookupResult } from './types'

/**
 * Courier client resolution (AUDIT.md Q-22, Q-25).
 *
 * `server-only`: this module reads credentials, so importing it from a Client
 * Component is a build error rather than a password in the browser bundle. The
 * picker imports its *types* from `./types`, which carries no such marker.
 *
 * The checkout never constructs a client itself. It asks `courierClient()` and
 * gets either a working one or one that answers `unconfigured` to everything —
 * so the only place that knows whether a courier is wired up is here.
 *
 * Credentials come from a signed merchant contract and belong in environment
 * variables — see `.env.example`.
 */

export type { CourierCity, CourierClient, CourierOffice, LookupResult } from './types'

/**
 * Which Econt nomenclature to read.
 *
 * `production` is the default and needs no configuration, because the office
 * nomenclature is public — see the header of `econt.ts`. Credentials buy
 * waybills, not the office list.
 *
 * `demo` exists for exercising the flow against the same dataset the demo
 * `LabelService` will accept once waybills are built. It is a worse dataset in
 * every other respect: 586 offices to production's 632, **2** lockers in the
 * whole country against 43, and an office literally named `testtest`. Hence
 * opt-in only, and never in production.
 */
export type CourierEnvironment = 'production' | 'demo'

const ECONT_BASE_URL: Record<CourierEnvironment, string> = {
  production: 'https://ee.econt.com/services',
  demo: 'https://demo.econt.com/ee/services',
}

/** Environment variable names, one place, so the checks cannot drift. */
const CREDENTIAL_VARS: Record<Courier, readonly string[]> = {
  econt: ['ECONT_USERNAME', 'ECONT_PASSWORD'],
  speedy: ['SPEEDY_USERNAME', 'SPEEDY_PASSWORD'],
}

/**
 * Whether a courier's *waybill* credentials are present.
 *
 * Not a question about the office picker, which needs none. This gates label
 * creation, COD and tracking — see AUDIT.md Phase 4.
 */
export function isCourierConfigured(courier: Courier): boolean {
  return CREDENTIAL_VARS[courier].every((name) => Boolean(process.env[name]))
}

/** Courier credentials that are still missing, for the launch checklist. */
export function missingCourierCredentials(): string[] {
  return Object.values(CREDENTIAL_VARS)
    .flat()
    .filter((name) => !process.env[name])
}

/**
 * The Econt nomenclature in force. Never `null`: the office list is public, so
 * there is always a real one to read.
 *
 * Reads `process.env` on every call rather than at module load, so a test can
 * set the variables and so a platform that injects them late still works.
 */
export function econtEnvironment(): CourierEnvironment {
  if (process.env.ECONT_ENV === 'demo') {
    if (process.env.NODE_ENV === 'production') {
      // Loud, because the alternative is a live checkout quietly offering
      // offices that do not exist. Falling back to the real list is safe here —
      // it needs no credentials — so the picker keeps working.
      console.error(
        'ECONT_ENV=demo is ignored in production: the demo nomenclature ' +
          'contains test offices. Using the real office list instead.'
      )
      return 'production'
    }

    return 'demo'
  }

  return 'production'
}

/**
 * A client that answers `unconfigured` for everything.
 *
 * Deliberately not a client that returns fake offices. Plausible test data in
 * a delivery picker is worse than an empty one: it produces an order addressed
 * to an office that does not exist, and nobody notices until the parcel is
 * refused.
 */
function unconfiguredClient(courier: Courier): CourierClient {
  const result = <T,>(): Promise<LookupResult<T>> =>
    Promise.resolve({ status: 'unconfigured' as const, courier })

  return {
    courier,
    searchCities: result,
    officesIn: result,
    findOffice: result,
  }
}

/**
 * Clients are cached per environment because each holds the office-list cache.
 * A fresh client per request would re-download 1.7 MB every lookup.
 */
const clients = new Map<string, CourierClient>()

function econtClient(): CourierClient {
  const environment = econtEnvironment()

  const key = `econt:${environment}`
  const existing = clients.get(key)
  if (existing) return existing

  const created = createEcontClient({
    baseUrl: process.env.ECONT_BASE_URL ?? ECONT_BASE_URL[environment],
  })

  clients.set(key, created)

  return created
}

/**
 * Client for a courier.
 *
 * Speedy is still the unconfigured stub: its API needs credentials issued by
 * hand (`api@speedy.bg`), with no public demo environment, so there is nothing
 * to build against yet. `/location/site`, `/location/office` and `/calculate`
 * are the endpoints it will need — see AUDIT.md Phase 4.
 */
export function courierClient(courier: Courier): CourierClient {
  // [TODO: Q-22 — return a SpeedyClient once test credentials exist.]
  return courier === 'econt' ? econtClient() : unconfiguredClient('speedy')
}

/**
 * Couriers whose office list we can actually show.
 *
 * The checkout page passes this to the delivery form so the picker appears only
 * where it works, and the free-text fallback appears everywhere else.
 *
 * Econt is unconditional because its nomenclature is public. Speedy is absent
 * because its client is a stub — and note this is *not* `isCourierConfigured`:
 * Speedy credentials can be present while it still cannot answer, and offering
 * an empty picker on the strength of an environment variable would be the lie
 * this whole module avoids.
 */
export function couriersWithOfficeLookup(): Courier[] {
  return ['econt']
}
