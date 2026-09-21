import 'server-only'

import { company, isTodo } from '../company'
import { CURRENCY } from '../money'
import type { Courier } from '../shipping'
import {
  createEcontClient,
  type EcontCodPayout,
  type EcontSender,
  type EcontShipFrom,
} from './econt'
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

export type {
  CourierCity,
  CourierClient,
  CourierOffice,
  LookupResult,
  ShipmentQuoteRequest,
  ShipmentRate,
  Waybill,
  WaybillRequest,
} from './types'
export type { EcontCodPayout, EcontSender, EcontShipFrom } from './econt'
export { econtTrackingUrl } from './econt'

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
const CREDENTIAL_VARS: Record<Courier, readonly [string, string]> = {
  econt: ['ECONT_USERNAME', 'ECONT_PASSWORD'],
  speedy: ['SPEEDY_USERNAME', 'SPEEDY_PASSWORD'],
}

/** Where parcels are handed over. See `econtShipFrom()`. */
const SENDER_VARS = {
  officeCode: 'ECONT_SENDER_OFFICE_CODE',
  city: 'ECONT_SENDER_CITY',
  postCode: 'ECONT_SENDER_POST_CODE',
  street: 'ECONT_SENDER_STREET',
} as const

/** Who the parcel is from, on the waybill only. See `econtSender()`. */
const IDENTITY_VARS = {
  name: 'ECONT_SENDER_NAME',
  phone: 'ECONT_SENDER_PHONE',
} as const

/** Where the наложен платеж money goes. See `econtCodPayout()`. */
const PAYOUT_VARS = {
  template: 'ECONT_COD_PAY_TEMPLATE',
  iban: 'ECONT_COD_IBAN',
  bic: 'ECONT_COD_BIC',
} as const

/**
 * Whether a courier's *waybill* credentials are present.
 *
 * Not a question about the office picker, which needs none. This gates label
 * creation, COD and tracking — see AUDIT.md Phase 4.
 */
export function isCourierConfigured(courier: Courier): boolean {
  return CREDENTIAL_VARS[courier].every((name) => Boolean(process.env[name]))
}

/** Credentials for a courier, or `null` while either half is missing. */
function credentialsFor(courier: Courier): { username: string; password: string } | null {
  const [userVar, passVar] = CREDENTIAL_VARS[courier]
  const username = process.env[userVar]
  const password = process.env[passVar]

  return username && password ? { username, password } : null
}

/**
 * Where parcels are handed over to Econt, in order of precedence:
 *
 * 1. `ECONT_SENDER_OFFICE_CODE` — the merchant drops parcels at that office.
 * 2. `ECONT_SENDER_CITY` + `_POST_CODE` + `_STREET`, all three, for collection
 *    from somewhere other than the registered seat.
 * 3. The registered address in `src/lib/company.ts`, once the owner fills it in.
 *
 * `null` while none of those is available, which makes live pricing
 * `unconfigured` rather than priced from a guess. The hand-over point changes the
 * tariff line — office→office is cheaper than a collection — so a default here
 * would be a wrong price, not a convenience. See the pricing note in `econt.ts`.
 */
export function econtShipFrom(): EcontShipFrom | null {
  const officeCode = process.env[SENDER_VARS.officeCode]?.trim()
  if (officeCode) return { officeCode }

  const city = process.env[SENDER_VARS.city]?.trim()
  const postCode = process.env[SENDER_VARS.postCode]?.trim()
  const street = process.env[SENDER_VARS.street]?.trim()

  if (city && postCode && street) return { city, postCode, street }

  const seat = company.address
  if (isTodo(seat.city) || isTodo(seat.postalCode) || isTodo(seat.street)) return null

  return { city: seat.city, postCode: seat.postalCode, street: seat.street }
}

/**
 * Who the parcel is from, for the waybill. `null` while no phone is configured.
 *
 * The phone is the whole of the requirement: Econt refuses a label without one,
 * and `company.contact.phone` is deliberately `null` because the owner does not
 * publish their number. `ECONT_SENDER_NAME` is optional and defaults to the legal
 * entity — the name on the parcel should be the name on the invoice unless the
 * owner has a reason otherwise.
 */
export function econtSender(): EcontSender | null {
  const phone = process.env[IDENTITY_VARS.phone]?.trim()
  if (!phone) return null

  return {
    name: process.env[IDENTITY_VARS.name]?.trim() || company.legalName,
    phone,
  }
}

/**
 * How Econt remits наложен платеж, in order of precedence:
 *
 * 1. `ECONT_COD_PAY_TEMPLATE` — a payout arrangement configured on the Econt
 *    profile. Preferred: the account number never travels in a request.
 * 2. `ECONT_COD_IBAN` + `ECONT_COD_BIC` — the account, sent with each shipment.
 *    Works without a merchant contract.
 *
 * `null` for neither, which is not an error: Econt then applies the profile's own
 * default, and for a personal profile that means collecting the cash at an office
 * counter. See `EcontCodPayout`.
 */
export function econtCodPayout(): EcontCodPayout | null {
  const template = process.env[PAYOUT_VARS.template]?.trim()
  if (template) return { template }

  const iban = process.env[PAYOUT_VARS.iban]?.trim()
  const bic = process.env[PAYOUT_VARS.bic]?.trim()

  // Both or neither: an IBAN without a BIC is rejected by Econt, and sending a
  // half-arrangement would fail the booking rather than fall back to the default.
  if (iban && bic) return { method: 'bank', iban, bic, currency: CURRENCY }

  return null
}

/**
 * Whether this courier can quote a real price.
 *
 * Separate from `isCourierConfigured`, which only asks about credentials: a
 * quote also needs to know where the parcel starts. Both are required, so both
 * are checked in one place rather than at each call site.
 */
export function canQuoteLiveRates(courier: Courier): boolean {
  if (courier !== 'econt') return false

  return isCourierConfigured(courier) && econtShipFrom() !== null
}

/**
 * Whether this courier can issue a real waybill.
 *
 * Everything pricing needs, plus a sender to put on the label. Strictly stronger
 * than `canQuoteLiveRates`, and kept separate because the shop can legitimately
 * run with live prices and hand-written labels — which is exactly where it stood
 * before this was built.
 */
export function canBookWaybills(courier: Courier): boolean {
  return canQuoteLiveRates(courier) && econtSender() !== null
}

/** What waybill creation is still waiting on, for the launch checklist. */
export function missingWaybillRequirements(): string[] {
  const missing = missingLiveRateRequirements()

  if (econtSender() === null) missing.push(IDENTITY_VARS.phone)

  return missing
}

/**
 * What live pricing is still waiting on, for the launch checklist and the
 * checkout's own "these rates are placeholders" notice.
 */
export function missingLiveRateRequirements(): string[] {
  const missing = CREDENTIAL_VARS.econt.filter((name) => !process.env[name])

  if (econtShipFrom() === null) {
    missing.push(`${SENDER_VARS.officeCode} or the registered address in company.ts`)
  }

  return missing
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
    priceShipment: result,
    createWaybill: result,
  }
}

/**
 * Clients are cached per environment because each holds the office-list cache.
 * A fresh client per request would re-download 1.7 MB every lookup.
 *
 * Credentials and the hand-over point are *not* part of the key: the client
 * reads them through the getters below on every quote, so a cached client cannot
 * hold a stale password.
 */
const clients = new Map<string, CourierClient>()

function econtClient(): CourierClient {
  const environment = econtEnvironment()

  const key = `econt:${environment}`
  const existing = clients.get(key)
  if (existing) return existing

  const created = createEcontClient({
    baseUrl: process.env.ECONT_BASE_URL ?? ECONT_BASE_URL[environment],
    credentials: () => credentialsFor('econt'),
    shipFrom: econtShipFrom,
    sender: econtSender,
    codPayout: econtCodPayout,
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
