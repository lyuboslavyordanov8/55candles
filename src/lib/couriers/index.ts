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
import { createSpeedyClient, type SpeedyCodProcessing, type SpeedySender } from './speedy'
import type { CourierClient } from './types'

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
export type { SpeedyCodProcessing, SpeedySender } from './speedy'
export { speedyTrackingUrl } from './speedy'

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
  molName: 'ECONT_SENDER_MOL_NAME',
} as const

/** Where the наложен платеж money goes. See `econtCodPayout()`. */
const PAYOUT_VARS = {
  template: 'ECONT_COD_PAY_TEMPLATE',
  iban: 'ECONT_COD_IBAN',
  bic: 'ECONT_COD_BIC',
} as const

/**
 * Speedy's equivalents. There is no sender *address* among them: Speedy takes
 * the sender from the contract client, so the only thing to configure is which
 * client we are and where we hand parcels in. See `speedySender()`.
 */
const SPEEDY_VARS = {
  clientId: 'SPEEDY_SENDER_CLIENT_ID',
  dropoffOffice: 'SPEEDY_DROPOFF_OFFICE_ID',
  serviceId: 'SPEEDY_SERVICE_ID',
  codProcessing: 'SPEEDY_COD_PROCESSING',
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
 * Who the parcel is from, for the waybill. `null` while the phone or the
 * authorised person (МОЛ) is not configured.
 *
 * Both are required: Econt refuses a label without a phone to ring, and — since
 * the sender is always our registered ЕООД — without a `molName` to put beside
 * it (see the doc comment on `EcontSender`). `company.contact.phone` is
 * deliberately `null` because the owner does not publish their number.
 * `ECONT_SENDER_NAME` is optional and defaults to the legal entity — the name
 * on the parcel should be the name on the invoice unless the owner has a
 * reason otherwise.
 */
export function econtSender(): EcontSender | null {
  const phone = process.env[IDENTITY_VARS.phone]?.trim()
  const molName = process.env[IDENTITY_VARS.molName]?.trim()
  if (!phone || !molName) return null

  return {
    name: process.env[IDENTITY_VARS.name]?.trim() || company.legalName,
    phone,
    molName,
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
 * Who the parcel is from, for Speedy. `null` while no client id is configured.
 *
 * The whole of the requirement, and it cannot be defaulted: Speedy will not
 * price a parcel whose payer is not a contract client — it answers *"Ваш обект
 * или обект по договор трябва да е платец или подател"* — so there is no
 * anonymous mode to fall back to the way Econt has one. The id is the merchant's
 * own object under their contract, read from `POST /v1/client/contract`.
 *
 * `dropoffOfficeId` is optional and changes the tariff line: with it Speedy
 * prices a drop-off at that office, without it a collection from the client's
 * registered address.
 */
export function speedySender(): SpeedySender | null {
  const clientId = positiveInteger(process.env[SPEEDY_VARS.clientId])
  if (clientId === null) return null

  const dropoffOfficeId = positiveInteger(process.env[SPEEDY_VARS.dropoffOffice])

  return { clientId, ...(dropoffOfficeId === null ? {} : { dropoffOfficeId }) }
}

/**
 * A configured whole number, or `null` for anything else.
 *
 * Silent on a malformed value rather than throwing: a typo in a client id makes
 * Speedy `unconfigured`, which falls back to the placeholder tariff, where an
 * exception would take the checkout down. The launch checklist names the
 * variable, so the typo is still reported — just not by crashing.
 */
function positiveInteger(value: string | undefined): number | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const parsed = Number(trimmed)

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Which Speedy tariff to price and book on, or `undefined` for the client's own
 * default (`505`, „СТАНДАРТ 24 ЧАСА“). Which services a contract includes
 * differs, so this is configurable — see `DEFAULT_SERVICE_ID` in `speedy.ts`.
 */
export function speedyServiceId(): number | undefined {
  return positiveInteger(process.env[SPEEDY_VARS.serviceId]) ?? undefined
}

/**
 * How Speedy hands the наложен платеж money over.
 *
 * `CASH` — collect it at a Speedy counter — is the default, for the same reason
 * Econt's payout defaults to the profile's own arrangement: it works without a
 * COD annex. `POSTAL_MONEY_TRANSFER` wires it to the account on the contract and
 * is the better answer once that annex exists. An unrecognised value falls back
 * to `CASH` rather than being sent on to be rejected at booking time.
 */
export function speedyCodProcessing(): SpeedyCodProcessing {
  return process.env[SPEEDY_VARS.codProcessing]?.trim() === 'POSTAL_MONEY_TRANSFER'
    ? 'POSTAL_MONEY_TRANSFER'
    : 'CASH'
}

/**
 * Whether this courier can quote a real price.
 *
 * Separate from `isCourierConfigured`, which only asks about credentials: a
 * quote also needs to know where the parcel starts, and each courier says that
 * differently — an address for Econt, a contract client for Speedy.
 */
export function canQuoteLiveRates(courier: Courier): boolean {
  if (!isCourierConfigured(courier)) return false

  return courier === 'econt' ? econtShipFrom() !== null : speedySender() !== null
}

/**
 * Whether this courier can issue a real waybill.
 *
 * Everything pricing needs, plus whatever the label itself requires. Strictly
 * stronger than `canQuoteLiveRates` for Econt, which will not print a label
 * without a phone to ring; the same for Speedy, which takes the sender's name,
 * address and phone from the contract client and so needs nothing more.
 *
 * Kept separate because the shop can legitimately run with live prices and
 * hand-written labels — which is exactly where it stood before this was built.
 */
export function canBookWaybills(courier: Courier): boolean {
  if (!canQuoteLiveRates(courier)) return false

  return courier === 'econt' ? econtSender() !== null : true
}

/** What waybill creation is still waiting on, for the launch checklist. */
export function missingWaybillRequirements(courier: Courier): string[] {
  const missing = missingLiveRateRequirements(courier)

  if (courier === 'econt' && econtSender() === null) {
    if (!process.env[IDENTITY_VARS.phone]?.trim()) missing.push(IDENTITY_VARS.phone)
    if (!process.env[IDENTITY_VARS.molName]?.trim()) missing.push(IDENTITY_VARS.molName)
  }

  return missing
}

/**
 * What live pricing is still waiting on, for the launch checklist and the
 * checkout's own "these rates are placeholders" notice.
 */
export function missingLiveRateRequirements(courier: Courier): string[] {
  const missing = CREDENTIAL_VARS[courier].filter((name) => !process.env[name])

  if (courier === 'econt') {
    if (econtShipFrom() === null) {
      missing.push(`${SENDER_VARS.officeCode} or the registered address in company.ts`)
    }
  } else if (speedySender() === null) {
    missing.push(SPEEDY_VARS.clientId)
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
 * Speedy has one environment. There is no demo host: the test credentials Speedy
 * issues point at the real system through a fictitious client, which is why the
 * base URL is the production one and a test user's waybills are recognised as
 * test ones by the API rather than by the address they were sent to.
 */
const SPEEDY_BASE_URL = 'https://api.speedy.bg/v1'

function speedyClient(): CourierClient {
  const key = 'speedy'
  const existing = clients.get(key)
  if (existing) return existing

  const created = createSpeedyClient({
    baseUrl: process.env.SPEEDY_BASE_URL ?? SPEEDY_BASE_URL,
    credentials: () => credentialsFor('speedy'),
    sender: speedySender,
    serviceId: speedyServiceId,
    codProcessing: speedyCodProcessing,
  })

  clients.set(key, created)

  return created
}

/** Client for a courier. Both are real; each answers `unconfigured` on its own. */
export function courierClient(courier: Courier): CourierClient {
  return courier === 'econt' ? econtClient() : speedyClient()
}

/**
 * Couriers whose office list we can actually show.
 *
 * The checkout page passes this to the delivery form so the picker appears only
 * where it works, and the free-text fallback appears everywhere else.
 *
 * Econt is unconditional because its nomenclature is *public* — no credentials,
 * so nothing can make the picker stop working. Speedy's is not: `/location/
 * office/` authenticates like every other Speedy call, so without credentials
 * there is no office list at all and the picker would render empty.
 */
export function couriersWithOfficeLookup(): Courier[] {
  return isCourierConfigured('speedy') ? ['econt', 'speedy'] : ['econt']
}
