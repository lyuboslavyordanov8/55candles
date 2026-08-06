import type { Courier, DeliveryMethod } from '../shipping'

/**
 * Courier office / locker lookup (AUDIT.md Q-22, Q-25).
 *
 * Both Econt and Speedy expose a nomenclature API — cities, offices, lockers —
 * behind merchant credentials. Neither is called yet, because there are no
 * credentials (Q-22). What exists here is the *interface* the checkout depends
 * on, plus a `status: 'unconfigured'` result the UI renders honestly.
 *
 * Why an interface rather than two bespoke integrations: the checkout should
 * not know which courier it is talking to. When credentials arrive, implement
 * `EcontClient` / `SpeedyClient` against this contract and the delivery form
 * does not change.
 *
 * Credentials belong in environment variables, never in code — see
 * `.env.example`.
 */

export interface CourierCity {
  id: string
  name: string
  postCode: string
}

export interface CourierOffice {
  id: string
  courier: Courier
  /** `office` or `locker` — a locker is an unstaffed office in both APIs. */
  kind: Extract<DeliveryMethod, 'office' | 'locker'>
  name: string
  address: string
  cityId: string
  /** Free-text opening hours as the courier reports them, if provided. */
  hours?: string
}

export type LookupResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'unconfigured'; courier: Courier }
  | { status: 'failed'; courier: Courier; reason: string }

export interface CourierClient {
  readonly courier: Courier
  searchCities(query: string): Promise<LookupResult<CourierCity[]>>
  officesIn(cityId: string): Promise<LookupResult<CourierOffice[]>>
}

/** Environment variable names, one place, so the checks cannot drift. */
const CREDENTIAL_VARS: Record<Courier, readonly string[]> = {
  econt: ['ECONT_USERNAME', 'ECONT_PASSWORD'],
  speedy: ['SPEEDY_USERNAME', 'SPEEDY_PASSWORD'],
}

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
  }
}

/**
 * Client for a courier.
 *
 * Returns the unconfigured client until credentials exist. When they do, this
 * is the one place to swap in the real implementation.
 */
export function courierClient(courier: Courier): CourierClient {
  // [TODO: Q-22 — return EcontClient / SpeedyClient once credentials exist.]
  return unconfiguredClient(courier)
}
