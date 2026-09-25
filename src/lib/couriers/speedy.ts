import 'server-only'

import { CURRENCY, money, type Money } from '../money'
import type { Courier } from '../shipping'
import { postJson } from './http'
import type {
  CourierCity,
  CourierClient,
  CourierOffice,
  LookupResult,
  ParcelDestination,
  ShipmentQuoteRequest,
  ShipmentRate,
  Waybill,
  WaybillRequest,
} from './types'

/**
 * Speedy REST API client (AUDIT.md Q-22, Phase 4).
 *
 * Verified against the live service on 2026-09-21 with the test user Speedy
 * issued, not from memory. Every request shape below was sent and answered.
 *
 * - JSON over HTTPS, **every** call is `POST`, base `https://api.speedy.bg/v1`.
 * - Reference: `https://api.speedy.bg/web-api.html`. The authoritative field
 *   list is the JSON Schema bundle at `https://api.speedy.bg/v1/schema` (a zip
 *   of ~180 schemas) — read that before changing a body, because the HTML page
 *   omits fields.
 * - Examples and the error catalogue: `https://services.speedy.bg/api/`.
 *
 * ## Three ways Speedy differs from Econt, all load-bearing
 *
 * 1. **Credentials travel in the body, not in a header.** `userName` and
 *    `password` are fields of every request, so `postJson` is called without its
 *    `auth` option and `withCredentials()` merges them in.
 *
 * 2. **Application errors arrive as HTTP 200 with an `error` object.** Verified:
 *    a request with no `serviceIds` answers `200` and
 *    `{"error":{"context":"calculation.service.service_ids.required",…}}`. So a
 *    `response.ok` from `postJson` says nothing about success here, and every
 *    call goes through `unwrap()`. Missing that check would read a price of
 *    `undefined` as a free parcel.
 *
 * 3. **Nothing is public.** Econt's office nomenclature answers anonymously;
 *    Speedy's `/location/office/` needs the same credentials as a waybill. So
 *    Speedy's office *picker* is gated on configuration too — see
 *    `couriersWithOfficeLookup()` in `./index.ts`.
 *
 * ## The sender must be a contract client
 *
 * Econt prices a parcel from any address. Speedy refuses: with a `privatePerson`
 * sender it answers *"Ваш обект или обект по договор трябва да е платец или
 * подател"* and prices nothing. The sender is therefore a **client id** from
 * `POST /v1/client/contract` — the merchant's own object under their Speedy
 * contract — and without one this client answers `unconfigured` rather than
 * guessing. That is also why Speedy cannot be launched on a personal account the
 * way Econt was: it needs a signed contract.
 *
 * ## Pricing and booking are separate endpoints
 *
 * `POST /calculate/` prices without creating anything; `POST /shipment/`
 * **books a real parcel the shop is billed for**. Unlike Econt there is no mode
 * flag to get the wrong way round — two endpoints, two functions, and the
 * booking URL appears once in this file.
 *
 * Measured 2026-09-21, same 0.55 kg parcel with 19.99 EUR наложен платеж, from
 * the Plovdiv depot: to a locker 2.45 EUR, to a door in the same city 6.16 EUR.
 * The breakdown separates `codPremium` from everything else, which is the split
 * `ShipmentRate` needs (Q-23).
 *
 * ## What is deliberately not here
 *
 * - **No label PDF.** Speedy prints through `POST /print/`, which returns the
 *   bytes rather than a URL, so `Waybill.pdfUrl` stays absent and the admin
 *   prints from Speedy's own site. Econt hands back a link; this is not a
 *   regression of anything.
 * - **No English names.** The nomenclature is returned in one language per
 *   request and the office list is 3.3 MB, so `language: 'BG'` is sent once and
 *   `addressEn` / `cityNameEn` are left absent rather than paid for twice.
 * - **No `cod.includeShippingPrice`.** It would have Speedy *add* its carriage
 *   to the amount collected at the door. The customer already paid delivery
 *   inside the order total, so this must stay off: turning it on would collect
 *   the shipping twice.
 */

/**
 * Who the parcel is from, as Speedy accounts for it.
 *
 * - `clientId` — the merchant's object under their Speedy contract, from
 *   `POST /v1/client/contract`. Both the sender and the payer.
 * - `dropoffOfficeId` — the office the merchant hands parcels in at. Optional:
 *   without it Speedy prices a collection from the client's registered address,
 *   which is a different (higher) tariff line, so this is configuration rather
 *   than a default.
 */
export interface SpeedySender {
  clientId: number
  dropoffOfficeId?: number
}

/** How Speedy hands over the наложен платеж money it collects. */
export type SpeedyCodProcessing = 'CASH' | 'POSTAL_MONEY_TRANSFER'

export interface SpeedyConfig {
  baseUrl: string
  /**
   * Credentials, or `null` while either half is unset.
   *
   * A function, not a value, for the same reason as Econt's: clients are cached
   * for the life of the process while the environment is read per call, so a
   * cached client can never hold a stale password.
   */
  credentials?: () => { username: string; password: string } | null
  /** Sender and payer, same lazy reasoning as `credentials`. */
  sender?: () => SpeedySender | null
  /**
   * Which tariff to price and book on, or `undefined` for `DEFAULT_SERVICE_ID`.
   */
  serviceId?: () => number | undefined
  /** COD payout arrangement, same lazy reasoning as `credentials`. */
  codProcessing?: () => SpeedyCodProcessing
  /**
   * Whether Speedy issues the касов бон for our наложен платеж sales, and in
   * which VAT group; `null` while it does not. See `SpeedyFiscalReceipt`.
   */
  fiscalReceipt?: () => SpeedyFiscalReceipt | null
}

/**
 * The Н-18 annex: Speedy registers a наложен платеж sale in its own system and
 * hands the recipient a системен бон in the shop's name — but only for a
 * shipment that carries `cod.fiscalReceiptItems`. Without them there is no
 * receipt, silently, which is why this is either configured or failed, never
 * skipped.
 *
 * `vatGroup` is Speedy's Cyrillic letter: `А` for 0 % (a shop that is not VAT
 * registered), `Б` for 20 %. `vatRate` is the matching fraction, used to split
 * each line into the before-VAT amount Speedy also wants.
 */
export interface SpeedyFiscalReceipt {
  vatGroup: string
  vatRate: number
}

const COURIER: Courier = 'speedy'

/** Bulgaria, in Speedy's own country nomenclature. */
const COUNTRY_ID = 100

/** Responses are asked for in Bulgarian: that is what the picker renders. */
const LANGUAGE = 'BG'

/**
 * `505` — „СТАНДАРТ 24 ЧАСА“, the ordinary parcel service.
 *
 * Taken from `POST /services/destination/` on 2026-09-21, which offered exactly
 * two for a small parcel: `505` and `515` („СТАНДАРТ 24 ЧАСА ПАКЕТ“). Only one
 * is priced and booked, never a cheapest-of: the tariff a shipment is booked on
 * has to be the one the customer was quoted, and `515` came back at 30.68 EUR
 * against `505`'s 2.45 for the same parcel under the test contract. Which
 * services a real contract includes differs, hence `SPEEDY_SERVICE_ID`.
 */
const DEFAULT_SERVICE_ID = 505

/** What goes on the parcel as its description. Not priced on, but required. */
const SHIPMENT_DESCRIPTION = 'Ароматни свещи'

/** Speedy's own packaging code for a parcel in a box. */
const PACKAGE = 'BOX'

/**
 * How long a projected office list is trusted. Six hours, as for Econt: offices
 * open and close on a scale of weeks, and the download is 3.3 MB.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/** Grams to the kilograms Speedy prices on. */
const GRAMS_PER_KG = 1000

/** Minor units per euro. Local, so this file needs nothing from `money.ts` but types. */
const MINOR_PER_MAJOR = 100

/**
 * A quote runs inside a checkout submission with a customer watching, so it gets
 * a tighter budget than the office list.
 */
const QUOTE_TIMEOUT_MS = 4_000

/**
 * A booking creates a billable parcel, so it is given time to answer and is
 * **never retried**: a retry after a response we failed to read would book a
 * second parcel. Same policy as Econt.
 */
const BOOKING_TIMEOUT_MS = 15_000
const BOOKING_ATTEMPTS = 1

/** Somebody is holding a print dialog open, not a checkout. */
const LABEL_TIMEOUT_MS = 10_000

/**
 * `A4` — the label on a quarter of an ordinary sheet, as MySpeedy prints it.
 * `A6` is the label alone, for a label printer. Both checked on 2026-09-25.
 */
const LABEL_PAPER = 'A4'

/** `/print` answers 200 with a JSON error for a parcel it cannot print. */
const PDF_SIGNATURE = '%PDF'

/** Why a cancellation happened, as Speedy records it. Required by the API. */
const CANCEL_COMMENT = 'Анулирана от админа на 55candles.com'

// ---------------------------------------------------------------------------
// Wire types — only the fields we read
// ---------------------------------------------------------------------------

/**
 * Deliberately a subset, and every field optional: the response is not ours and
 * has grown fields before, so the projection below decides what to do about a
 * missing value instead of trusting the shape.
 */
interface SpeedyError {
  message?: string
  context?: string
  id?: string
  component?: string
}

interface SpeedyRawAddress {
  siteId?: number
  siteName?: string
  postCode?: string
  fullAddressString?: string
}

interface SpeedyRawOffice {
  /** The id `pickupOfficeId` expects on a waybill. Numeric in the wire format. */
  id?: number
  name?: string
  nameEn?: string
  siteId?: number
  address?: SpeedyRawAddress
  /** `'HH:MM'` in Europe/Sofia — already a wall clock, unlike Econt's epochs. */
  workingTimeFrom?: string
  workingTimeTo?: string
  /** `OFFICE` is staffed, `APT` is an automated parcel terminal (a locker). */
  type?: string
  /** `PARCEL`, `PALLET`, `TYRE`. Absent on nothing we have seen. */
  cargoTypesAllowed?: string[]
  pickUpAllowed?: boolean
  /** `YYYY-MM-DD`. Live data has `3000-01-01` throughout. */
  validFrom?: string
  validTo?: string
}

interface SpeedyOfficesResponse {
  error?: SpeedyError
  offices?: SpeedyRawOffice[]
}

/** One line of the price breakdown. `amount` is net; VAT is a rate, not an amount. */
interface SpeedyPriceDetail {
  amount?: number
  vatPercent?: number
}

interface SpeedyPrice {
  /** Net of VAT. */
  amount?: number
  vat?: number
  /** What Speedy stands behind, VAT included. */
  total?: number
  currency?: string
  details?: Record<string, SpeedyPriceDetail | undefined>
}

interface SpeedyCalculation {
  serviceId?: number
  price?: SpeedyPrice
  deliveryDeadline?: string
  /** Per-service: one tariff can fail while another prices. */
  error?: SpeedyError
}

interface SpeedyCalculateResponse {
  error?: SpeedyError
  calculations?: SpeedyCalculation[]
}

interface SpeedyShipmentResponse {
  error?: SpeedyError
  /** The waybill number. Once this exists, a parcel exists. */
  id?: string
  price?: SpeedyPrice
  deliveryDeadline?: string
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/** `'08:30'` + `'19:30'` → `'08:30–19:30'`, or nothing worth showing. */
function formatHours(from?: string, to?: string): string | undefined {
  if (!from || !to || from === to) return undefined

  return `${from}–${to}`
}

/** Whether `YYYY-MM-DD`-bounded validity covers today. Absent bounds mean yes. */
function isInService(raw: SpeedyRawOffice, today: string): boolean {
  if (raw.validFrom && raw.validFrom > today) return false
  if (raw.validTo && raw.validTo < today) return false

  return true
}

/** Speedy's office type to ours, or `null` for one we must not offer. */
function kindOf(type: string | undefined): CourierOffice['kind'] | null {
  if (type === 'OFFICE') return 'office'
  if (type === 'APT') return 'locker'

  // Not a fallback to `office`. A partner pickup point is addressed by
  // `pickupGeoPUDOId`, not `pickupOfficeId`, so offering one as an office would
  // produce an order whose waybill Speedy rejects — the exact failure the
  // `unconfigured` fallback exists to avoid.
  return null
}

/**
 * One raw office to ours, or `null` to drop it.
 *
 * Dropping is the right answer for a record we cannot address a parcel to: an
 * office with no id cannot go on a waybill, and one with no post code cannot be
 * matched against what the customer typed.
 */
function toOffice(raw: SpeedyRawOffice, today: string): CourierOffice | null {
  const kind = kindOf(raw.type)
  const address = raw.address
  const siteId = raw.siteId ?? address?.siteId

  if (!kind || !raw.id || !raw.name || !siteId || !address?.postCode) return null

  // A parcel cannot be collected from somewhere that does not hand parcels out.
  if (raw.pickUpAllowed === false) return null

  // Treated as an allow-list only when present: if Speedy stops sending the
  // field, hiding every office would be worse than showing a few that turn out
  // to be pallet-only.
  if (raw.cargoTypesAllowed && !raw.cargoTypesAllowed.includes('PARCEL')) return null

  if (!isInService(raw, today)) return null

  return {
    id: String(raw.id),
    courier: COURIER,
    kind,
    name: raw.name,
    nameEn: raw.nameEn || undefined,
    address: address.fullAddressString?.trim() || '',
    cityId: String(siteId),
    cityName: address.siteName ?? '',
    postCode: address.postCode,
    hours: formatHours(raw.workingTimeFrom, raw.workingTimeTo),
  }
}

/**
 * Fold the office list into its distinct cities, ordered for a picker.
 *
 * Derived from the offices rather than read from `/location/site/`, which
 * returns every settlement Speedy serves — thousands of them, most with nowhere
 * to collect from. 254 of them have an office, and those are the only ones the
 * contract promises. Sorted with the Bulgarian collator, because the default
 * locale puts Cyrillic in code-point order, which is *nearly* alphabetical.
 */
function citiesOf(offices: readonly CourierOffice[]): CourierCity[] {
  const byId = new Map<string, CourierCity>()

  for (const office of offices) {
    if (!byId.has(office.cityId)) {
      byId.set(office.cityId, {
        id: office.cityId,
        name: office.cityName,
        postCode: office.postCode,
      })
    }
  }

  const collator = new Intl.Collator('bg')

  return [...byId.values()].sort((a, b) => collator.compare(a.name, b.name))
}

/** Case-insensitive contains, for the city search box. */
function matches(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase('bg').includes(needle)
}

/**
 * Speedy's delivery deadline to the ISO *date* `Waybill` asks for.
 *
 * It answers a full instant — `2026-09-22T19:00:00+0300`, the end of the
 * delivery window — where Econt answers `2026-09-23`. The date part is taken so
 * that the two couriers store the same shape; the hour is dropped rather than
 * shown, because "by 19:00" is a deadline and displaying it as a time would read
 * as an appointment.
 */
function toDeliveryDate(deadline: string | undefined): string | undefined {
  const date = deadline?.trim().slice(0, 10)

  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
}

/** Today in Europe/Sofia as `YYYY-MM-DD`, to compare against office validity. */
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Sofia',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * A courier's decimal amount to `Money`.
 *
 * Not `eur()`, which throws on a third decimal place: right for prices we
 * author, wrong for a number arriving over the network where an exception would
 * escape into a checkout request. Rounds to the cent, `null` for anything
 * unusable, and refuses another currency rather than converting — Speedy has
 * answered in EUR since 2026-01-01, and applying the statutory BGN rate silently
 * would put a number on the checkout that Speedy's invoice does not contain.
 */
function toMoney(value: unknown, currency: unknown): Money | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null

  if (typeof currency === 'string' && currency !== CURRENCY) return null

  return money(Math.round(value * MINOR_PER_MAJOR))
}

/** A net detail line to gross `Money`, `null` when it is not a usable amount. */
function grossOf(detail: SpeedyPriceDetail | undefined): Money | null {
  if (!detail || typeof detail.amount !== 'number' || !Number.isFinite(detail.amount)) return null
  if (detail.amount < 0) return null

  const rate = typeof detail.vatPercent === 'number' ? detail.vatPercent : 0

  return money(Math.round(detail.amount * (1 + rate) * MINOR_PER_MAJOR))
}

/** The line in `price.details` that is the наложен платеж fee. */
const COD_DETAIL = 'codPremium'

/**
 * A Speedy price to a `ShipmentRate`.
 *
 * Rules, in order of how much they matter:
 *
 * 1. **`price.total` is the truth about the total.** It is the figure Speedy
 *    stands behind, VAT included, so the returned `total` is always it and
 *    `delivery + codFee` is made to reconcile with it. The breakdown is net of
 *    VAT per line, so re-grossing a line and subtracting can be a cent off —
 *    that cent lands on delivery rather than on the total.
 * 2. **Only `codPremium` is the COD fee.** Every other line — carriage, fuel
 *    surcharge, address-delivery surcharge, and whatever Speedy adds next — is
 *    delivery. An unrecognised line therefore lands on the half the customer
 *    pays rather than being dropped, because a charge we silently absorb is a
 *    loss per parcel that nothing in the system would ever report.
 * 3. **No breakdown with COD requested is a failure.** The fee is inside the
 *    total and we cannot tell how much of it; splitting by guess would either
 *    charge the customer our fee or hide a cost. With no COD there is nothing to
 *    separate, so the total *is* the delivery price.
 *
 * No `description`: `/calculate/` answers with a `serviceId` and no service
 * name, and inventing wording for a tariff line would be worse than none.
 */
function toRate(price: SpeedyPrice | undefined, hasCod: boolean): LookupResult<ShipmentRate> {
  const failed = (reason: string): LookupResult<ShipmentRate> => ({
    status: 'failed',
    courier: COURIER,
    reason,
  })

  const total = toMoney(price?.total, price?.currency)

  if (!total) {
    return failed(
      `the quote came back with no usable price (${String(price?.total)} ${String(price?.currency)})`
    )
  }

  const codFee = grossOf(price?.details?.[COD_DETAIL])

  if (!codFee) {
    if (hasCod) {
      return failed(
        'the quote came back without a наложен платеж line, so the fee cannot be separated'
      )
    }

    // Nothing to separate: the total is the delivery price.
    return { status: 'ok', data: { delivery: total, codFee: money(0), total } }
  }

  const delivery = money(total.amountMinor - codFee.amountMinor)

  if (delivery.amountMinor < 0) {
    return failed('the breakdown implies a negative delivery charge')
  }

  return { status: 'ok', data: { delivery, codFee, total } }
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

/**
 * Who pays Speedy for carrying the parcel (AUDIT.md Q-23).
 *
 * **The shop, never the customer**, exactly as for Econt: the customer was shown
 * one number and the confirmation email repeats it, so the amount handed over at
 * the door has to be the COD amount and nothing more. `RECIPIENT` is not merely
 * wrong policy here, it does not price at all — verified 2026-09-21, where the
 * same parcel answered *"Не може да се определи цена за пратката"*.
 */
const COURIER_SERVICE_PAYER = 'SENDER'

/** The sender half of a request: the contract client, and where we hand parcels in. */
function senderOf(sender: SpeedySender): Record<string, unknown> {
  return {
    clientId: sender.clientId,
    ...(sender.dropoffOfficeId ? { dropoffOfficeId: sender.dropoffOfficeId } : {}),
  }
}

/**
 * An office id as Speedy expects it: a number.
 *
 * `CourierOffice.id` is a string because Econt's is, so a stored value that is
 * not a whole number means a Speedy office id that never came from us.
 */
function officeIdOf(officeId: string | undefined): number | null {
  if (!officeId) return null

  const parsed = Number(officeId)

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * The destination of a *quote*.
 *
 * A price depends on the settlement, not the street, and `AddressLocation`
 * carries no street field — so a door quote sends city and post code only. Both
 * are required: a post code alone is ambiguous between settlements.
 */
function quoteRecipientOf(request: ParcelDestination): Record<string, unknown> | null {
  if (request.method === 'door') {
    const address = request.address
    if (!address?.city || !address.postCode) return null

    return {
      privatePerson: true,
      addressLocation: {
        countryId: COUNTRY_ID,
        siteName: address.city,
        postCode: address.postCode,
      },
    }
  }

  const officeId = officeIdOf(request.officeId)
  if (!officeId) return null

  return { privatePerson: true, pickupOfficeId: officeId }
}

/**
 * The destination of a *waybill*: the quote's destination plus the person.
 *
 * Two things verified against the live service on 2026-09-21 and easy to get
 * wrong from the schema alone:
 *
 * - **A private recipient must not have a `contactName`.** With one, Speedy
 *   answers `"Получател Лице за контакт: Не се очаква име на контакт"` and books
 *   nothing. The name goes in `clientName`.
 * - **Free-text street goes in `addressNote`, not `addressLine1`.**
 *   `addressLine1` is rejected with *"Попълнете улица/квартал/характерен обект …
 *   или всички детайли за адреса САМО в полето „Уточнение“"*. Bulgarian
 *   addresses are written many valid ways and Speedy's own operator reads this
 *   field, so whatever the customer typed is passed through unparsed.
 */
function waybillRecipientOf(request: WaybillRequest): Record<string, unknown> | null {
  const person = {
    privatePerson: true,
    clientName: request.recipient.name,
    phone1: { number: request.recipient.phone },
    ...(request.recipient.email ? { email: request.recipient.email } : {}),
  }

  if (request.method === 'door') {
    const address = request.address
    if (!address?.city || !address.postCode || !address.street) return null

    return {
      ...person,
      address: {
        countryId: COUNTRY_ID,
        siteName: address.city,
        postCode: address.postCode,
        addressNote: address.street,
      },
    }
  }

  const officeId = officeIdOf(request.officeId)
  if (!officeId) return null

  return { ...person, pickupOfficeId: officeId }
}

/** The наложен платеж block, shared between a quote and a booking. */
function codOf(
  codAmount: NonNullable<ShipmentQuoteRequest['codAmount']>,
  processing: SpeedyCodProcessing,
  fiscalReceiptItems?: ReturnType<typeof fiscalItemsOf>
) {
  return {
    cod: {
      amount: codAmount.amountMinor / MINOR_PER_MAJOR,
      currencyCode: codAmount.currency,
      processingType: processing,
      // Off, deliberately: see the header. On, Speedy would add its carriage to
      // the amount collected at the door — shipping the customer already paid.
      includeShippingPrice: false,
      ...(fiscalReceiptItems ? { fiscalReceiptItems } : {}),
    },
  }
}

/** Speedy's limit on a receipt line's description. */
const FISCAL_DESCRIPTION_MAX = 50

/**
 * Our receipt lines in Speedy's shape, or `null` when they cannot be the
 * receipt for this parcel: none, or not adding up to the amount collected —
 * Speedy takes the COD amount *from* the items when there are any, so a
 * mismatch would change what the courier collects.
 */
function fiscalItemsOf(
  request: WaybillRequest,
  receipt: SpeedyFiscalReceipt
): { description: string; vatGroup: string; amount: number; amountWithVat: number }[] | null {
  const lines = request.receipt ?? []
  const sum = lines.reduce((total, line) => total + line.amount.amountMinor, 0)

  if (!request.codAmount || lines.length === 0 || sum !== request.codAmount.amountMinor) {
    return null
  }

  return lines.map((line) => {
    const withVat = line.amount.amountMinor

    return {
      description: line.description.slice(0, FISCAL_DESCRIPTION_MAX),
      vatGroup: receipt.vatGroup,
      amount: Math.round(withVat / (1 + receipt.vatRate)) / MINOR_PER_MAJOR,
      amountWithVat: withVat / MINOR_PER_MAJOR,
    }
  })
}

/** Grams to the kilograms Speedy prices on, never zero. */
function weightOf(weightGrams: number): number {
  return Math.max(weightGrams, 1) / GRAMS_PER_KG
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** How many cities a search returns. Enough to choose from, not to scroll. */
const MAX_CITY_RESULTS = 20

/** Shortest query worth sending. One letter matches most of the country. */
const MIN_QUERY_LENGTH = 2

/** Public tracking page, ready to send to a customer. */
export function speedyTrackingUrl(shipmentNumber: string): string {
  return `https://www.speedy.bg/bg/track-shipment?shipmentNumber=${encodeURIComponent(shipmentNumber)}`
}

interface CacheEntry {
  offices: CourierOffice[]
  fetchedAt: number
}

/** The human part of an error Speedy reported in a `200` body. */
function reasonOf(error: SpeedyError): string {
  return error.message?.trim() || error.context?.trim() || 'the courier reported an error'
}

export function createSpeedyClient(config: SpeedyConfig): CourierClient {
  let cached: CacheEntry | undefined
  /**
   * The in-flight request, so a page that resolves a city list and an office
   * list at once issues one 3.3 MB download instead of two. Cleared in
   * `finally` — a retained rejected promise would cache the failure forever.
   */
  let inFlight: Promise<LookupResult<CourierOffice[]>> | undefined

  const unconfigured = <T,>(): LookupResult<T> => ({ status: 'unconfigured', courier: COURIER })

  const failed = <T,>(reason: string): LookupResult<T> => ({
    status: 'failed',
    courier: COURIER,
    reason,
  })

  /** Credentials merged into a request body. Speedy authenticates per call. */
  function withCredentials(
    credentials: { username: string; password: string },
    body: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      userName: credentials.username,
      password: credentials.password,
      language: LANGUAGE,
      ...body,
    }
  }

  async function load(
    credentials: { username: string; password: string }
  ): Promise<LookupResult<CourierOffice[]>> {
    const response = await postJson<SpeedyOfficesResponse>({
      url: `${config.baseUrl}/location/office/`,
      body: withCredentials(credentials, { countryId: COUNTRY_ID }),
    })

    if (!response.ok) return failed(response.reason)

    if (response.data.error) return failed(reasonOf(response.data.error))

    const today = dayFormatter.format(new Date())

    const offices = (response.data.offices ?? [])
      .map((raw) => toOffice(raw, today))
      .filter((office): office is CourierOffice => office !== null)

    if (offices.length === 0) {
      // A 200 with nothing usable is a failure, not an empty country. Reporting
      // it as `ok: []` would render an empty picker with no explanation.
      return failed('the office list came back empty')
    }

    cached = { offices, fetchedAt: Date.now() }

    return { status: 'ok', data: offices }
  }

  /**
   * The office list, from cache when it is fresh.
   *
   * In-process, so on a serverless platform each cold instance pays for one
   * download — the same trade Econt's client makes, for the same reason.
   */
  async function nomenclature(): Promise<LookupResult<CourierOffice[]>> {
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { status: 'ok', data: cached.offices }
    }

    const credentials = config.credentials?.() ?? null

    // Unlike Econt, the nomenclature is not public: no credentials means no
    // office list at all, not a public one.
    if (!credentials) return unconfigured()

    inFlight ??= load(credentials).finally(() => {
      inFlight = undefined
    })

    return inFlight
  }

  function serviceId(): number {
    return config.serviceId?.() ?? DEFAULT_SERVICE_ID
  }

  function codProcessing(): SpeedyCodProcessing {
    return config.codProcessing?.() ?? 'CASH'
  }

  return {
    courier: COURIER,

    async searchCities(query) {
      const needle = query.trim().toLocaleLowerCase('bg')

      if (needle.length < MIN_QUERY_LENGTH) return { status: 'ok', data: [] }

      const result = await nomenclature()
      if (result.status !== 'ok') return result

      const found = citiesOf(result.data).filter(
        (city) => matches(city.name, needle) || city.postCode.startsWith(needle)
      )

      return { status: 'ok', data: found.slice(0, MAX_CITY_RESULTS) }
    },

    async officesIn(cityId, kind) {
      const result = await nomenclature()
      if (result.status !== 'ok') return result

      const collator = new Intl.Collator('bg')

      const found = result.data
        .filter((office) => office.cityId === cityId && office.kind === kind)
        .sort((a, b) => collator.compare(a.name, b.name))

      return { status: 'ok', data: found }
    },

    async findOffice(id) {
      const result = await nomenclature()
      if (result.status !== 'ok') return result

      return { status: 'ok', data: result.data.find((office) => office.id === id) ?? null }
    },

    async priceShipment(request) {
      const credentials = config.credentials?.() ?? null
      const sender = config.sender?.() ?? null

      // Neither can be substituted: without credentials there is no call, and
      // without a contract client Speedy prices nothing at all — see the header.
      if (!credentials || !sender) return unconfigured()

      const recipient = quoteRecipientOf(request)

      if (!recipient) return failed('the parcel has no addressable destination')

      const response = await postJson<SpeedyCalculateResponse>({
        url: `${config.baseUrl}/calculate/`,
        body: withCredentials(credentials, {
          sender: senderOf(sender),
          recipient,
          service: {
            serviceIds: [serviceId()],
            // Speedy refuses a pickup date it can no longer meet — after the
            // depot's cut-off, for instance. Adjusting is right for a quote: the
            // price of tomorrow's parcel is the price we want.
            autoAdjustPickupDate: true,
            ...(request.codAmount
              ? { additionalServices: codOf(request.codAmount, codProcessing()) }
              : {}),
          },
          content: { parcelsCount: 1, totalWeight: weightOf(request.weightGrams) },
          payment: { courierServicePayer: COURIER_SERVICE_PAYER },
        }),
        timeoutMs: QUOTE_TIMEOUT_MS,
      })

      if (!response.ok) return failed(response.reason)

      if (response.data.error) return failed(reasonOf(response.data.error))

      // One service was asked for, so the first calculation is the answer. A
      // per-service error is reported instead of the price it replaces.
      const calculation = response.data.calculations?.[0]

      if (!calculation) return failed('the courier priced no service for this parcel')

      if (calculation.error) return failed(reasonOf(calculation.error))

      return toRate(calculation.price, request.codAmount !== null)
    },

    async createWaybill(request) {
      const credentials = config.credentials?.() ?? null
      const sender = config.sender?.() ?? null

      if (!credentials || !sender) return unconfigured()

      const recipient = waybillRecipientOf(request)

      if (!recipient) return failed('the parcel has no addressable destination')

      // With the Н-18 annex on, a наложен платеж parcel without its receipt is
      // a sale with no касов бон — refused here rather than booked.
      const fiscal = request.codAmount ? (config.fiscalReceipt?.() ?? null) : null
      const fiscalItems = fiscal ? fiscalItemsOf(request, fiscal) : undefined

      if (fiscalItems === null) {
        return failed('the receipt lines do not add up to the наложен платеж amount')
      }

      const response = await postJson<SpeedyShipmentResponse>({
        url: `${config.baseUrl}/shipment/`,
        body: withCredentials(credentials, {
          sender: senderOf(sender),
          recipient,
          service: {
            serviceId: serviceId(),
            autoAdjustPickupDate: true,
            ...(request.codAmount
              ? { additionalServices: codOf(request.codAmount, codProcessing(), fiscalItems) }
              : {}),
          },
          content: {
            parcelsCount: 1,
            totalWeight: weightOf(request.weightGrams),
            contents: SHIPMENT_DESCRIPTION,
            package: PACKAGE,
          },
          payment: { courierServicePayer: COURIER_SERVICE_PAYER },
          // Our order number, on the label and in Speedy's own record, so a
          // parcel found on a shelf can be traced back to an order.
          ref1: request.orderNumber,
        }),
        timeoutMs: BOOKING_TIMEOUT_MS,
        attempts: BOOKING_ATTEMPTS,
      })

      if (!response.ok) return failed(response.reason)

      const number = response.data.id?.trim()

      if (!number) {
        const reason = response.data.error
          ? reasonOf(response.data.error)
          : 'the courier accepted the request but returned no waybill number'

        if (!response.data.error) {
          // A 200 with neither a number nor an error. Reported as a failure
          // because nothing was created — but loudly, because if that reading is
          // ever wrong it is the expensive kind of wrong, and the response is
          // the only evidence.
          console.error(
            `[speedy] shipment answered 200 with no id for order ${request.orderNumber}: ` +
              `${JSON.stringify(response.data).slice(0, 500)}`
          )
        }

        return failed(reason)
      }

      // Past this point a parcel exists and the shop will be billed for it, so
      // nothing below may turn into a `failed` the caller would retry. The price
      // is read through the same projection as a quote but treated as optional:
      // `hasCod: false` because a breakdown we cannot split is worth a log line,
      // not a second parcel. A `codPremium` line that *is* there is still split
      // out, so the stored price is right whenever it can be.
      const priced = toRate(response.data.price, false)
      const expected = toDeliveryDate(response.data.deliveryDeadline)

      return {
        status: 'ok',
        data: {
          number,
          trackingUrl: speedyTrackingUrl(number),
          ...(expected ? { expectedDeliveryDate: expected } : {}),
          ...(priced.status === 'ok' ? { price: priced.data } : {}),
        },
      }
    },

    /**
     * Not built yet, deliberately: `BOOKABLE_COURIERS` is Econt-only until there
     * is a Speedy contract, so no order carries a Speedy waybill to track, and a
     * mapping of `/track` written without one real parcel to check it against
     * would be a guess. `unconfigured` makes the admin say "no tracking" rather
     * than "the courier failed".
     */
    async trackShipments() {
      return unconfigured()
    },

    /**
     * `POST /print` — the same label MySpeedy prints, as bytes.
     *
     * The field is `paperSize`, not `paper`: with the wrong one Speedy answers
     * "Print paper size expected". An unknown parcel is a 200 carrying a JSON
     * `error`, so only the `%PDF` signature is taken as a label.
     *
     * No `Accept: application/pdf`: Speedy answers that with a 406 (verified
     * 2026-09-25), because the error answer it may send is JSON.
     */
    async labelPdf(number) {
      const credentials = config.credentials?.() ?? null
      if (!credentials) return unconfigured()

      try {
        const response = await fetch(`${config.baseUrl}/print/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            withCredentials(credentials, {
              paperSize: LABEL_PAPER,
              parcels: [{ parcel: { id: number } }],
            })
          ),
          signal: AbortSignal.timeout(LABEL_TIMEOUT_MS),
          cache: 'no-store',
        })

        if (!response.ok) return failed(`HTTP ${response.status}`)

        const bytes = await response.arrayBuffer()
        const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, PDF_SIGNATURE.length))

        if (String.fromCharCode(...head) !== PDF_SIGNATURE) {
          return failed(labelErrorOf(bytes))
        }

        return { status: 'ok', data: bytes }
      } catch (error) {
        return failed(error instanceof Error ? error.message : 'unknown error')
      }
    },

    /**
     * `POST /shipment/cancel`. Only possible before the parcel is handed over;
     * after that Speedy refuses, and says why.
     *
     * **An empty answer is success only because a number was sent.** Speedy
     * also answers `{}` to a request with no `shipmentId` at all — verified
     * 2026-09-25 — so the guard below is what makes `{}` mean something.
     * Not retried: the call has a side effect, and a second attempt after a
     * lost answer would only be refused as already cancelled.
     */
    async cancelWaybill(number) {
      const credentials = config.credentials?.() ?? null
      if (!credentials) return unconfigured()

      const shipmentId = number.trim()
      if (!shipmentId) return failed('no waybill number to cancel')

      const response = await postJson<{ error?: SpeedyError }>({
        url: `${config.baseUrl}/shipment/cancel/`,
        body: withCredentials(credentials, { shipmentId, comment: CANCEL_COMMENT }),
        timeoutMs: BOOKING_TIMEOUT_MS,
        attempts: BOOKING_ATTEMPTS,
      })

      if (!response.ok) return failed(response.reason)
      if (response.data.error) return failed(reasonOf(response.data.error))

      return { status: 'ok', data: null }
    },
  }
}

/** Speedy's own wording from a `/print` that did not return a PDF. */
function labelErrorOf(bytes: ArrayBuffer): string {
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { error?: SpeedyError }
    if (body.error) return reasonOf(body.error)
  } catch {
    // Not JSON either: fall through to the size, which is all there is to say.
  }

  return `${bytes.byteLength} bytes that are not a PDF`
}
