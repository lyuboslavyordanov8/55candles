import 'server-only'

import { CURRENCY, money, type Money } from '../money'
import type { Courier } from '../shipping'
import { postJson } from './http'
import type {
  CourierCity,
  CourierClient,
  CourierOffice,
  LookupResult,
  ShipmentQuoteRequest,
  ShipmentRate,
} from './types'

/**
 * Econt Delivery API client (AUDIT.md Q-22, B-13).
 *
 * Verified against the live service on 2026-09-16, not from memory:
 *
 * - JSON over HTTPS, **every** call is `POST`.
 * - Production `https://ee.econt.com/services`, demo
 *   `https://demo.econt.com/ee/services`.
 * - OpenAPI description at `https://ee.econt.com/services/openapi.yaml` —
 *   consult that before changing a request shape.
 *
 * No npm wrapper. The surface we need is three projections of one endpoint, and
 * an unofficial wrapper would be another dependency to audit for a saving of
 * about forty lines.
 *
 * ## Why the *nomenclature* sends no credentials
 *
 * The nomenclature is public. Verified: `getOffices` answers `200` with the full
 * 1.8 MB production list over anonymous HTTP on both the production and demo
 * hosts — it is the same data econt.bg puts in its own public office finder.
 *
 * Credentials are not merely unnecessary here, they are a hazard: the endpoint
 * validates them when present, so a typo in `ECONT_PASSWORD` turns a working
 * `200` into `517 ExInvalidParam` and takes the office picker down with it. The
 * demo credentials do the same against production. So this client carries no
 * auth at all and cannot be broken by a credential problem.
 *
 * Credentials *are* required for `Shipments/LabelService` — waybills, COD, the
 * things that cost money. `priceShipment` is that call site and carries its own;
 * it is also the only thing here that can answer `unconfigured`.
 *
 * ## Pricing: `createLabel` in `calculate` mode
 *
 * There is no separate rate endpoint. `Shipments/LabelService.createLabel.json`
 * takes `mode: 'calculate' | 'validate' | 'create'`, and `calculate` prices a
 * parcel without booking anything — verified against the demo service on
 * 2026-09-20, where it returned the tariff line by name ("между офисите на
 * куриера до 1 кг") and a separate наложен платеж fee.
 *
 * Two things about that response are load-bearing:
 *
 * - **`services[]` is the breakdown**, each entry with a `type`, a `price` and a
 *   currency. `CD` is the наложен платеж fee; everything else is part of
 *   carrying the parcel. We allocate those two halves differently (Q-23), so the
 *   split matters and a lump `totalPrice` would not do.
 * - **The price depends on where the parcel is handed over**, not just where it
 *   goes: office→office was 3.44 EUR where address→office was 4.55 EUR for the
 *   same 0.4 kg parcel. So the sender is configuration, never a default — see
 *   `EcontShipFrom` and `econtShipFrom()` in `./index.ts`.
 *
 * ## Why only `getOffices`
 *
 * `NomenclaturesService.getCities` returns every settlement Econt serves —
 * 5 488 of them, **18 MB**, because each city embeds its full serving-office
 * table. We do not need it. `getOffices` is 1.7 MB, and each office carries its
 * city with id and post code, so the city list is derived from it. That is one
 * call instead of two, a tenth of the bytes, and it can only ever offer a city
 * that actually has somewhere to collect from.
 */

/**
 * Where parcels are handed over to Econt. One of the two forms, never both:
 *
 * - `officeCode` — the merchant drops parcels at that office.
 * - `city` + `postCode` + `street` — a courier collects from this address.
 *
 * Not defaulted, and not derived from the destination: see the pricing note in
 * the header. A guessed hand-over point is a guessed price.
 */
export interface EcontShipFrom {
  officeCode?: string
  city?: string
  postCode?: string
  street?: string
}

export interface EcontConfig {
  baseUrl: string
  /**
   * Contract credentials for `LabelService`, or `null` while unset.
   *
   * A function rather than a value because clients are cached for the lifetime
   * of the process (see `./index.ts`) while credentials come from the
   * environment, which a platform may inject late and a test may change between
   * cases. Read per call, so a cached client is never a stale one.
   */
  credentials?: () => { username: string; password: string } | null
  /** Hand-over point, same lazy reasoning as `credentials`. */
  shipFrom?: () => EcontShipFrom | null
}

const COURIER: Courier = 'econt'

/**
 * How long a projected office list is trusted.
 *
 * Offices open and close on a scale of weeks, so six hours is generous for
 * freshness and still spares the courier a 1.7 MB download per lookup. It is
 * *not* a substitute for re-validating the chosen office at submit — see
 * `findOffice`.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/** Econt reports opening hours as epoch ms encoding a Sofia wall-clock time. */
const COURIER_TIME_ZONE = 'Europe/Sofia'

// ---------------------------------------------------------------------------
// Wire types — only the fields we read
// ---------------------------------------------------------------------------

/**
 * Deliberately a subset, and every field optional.
 *
 * The response is not ours and has grown fields before. Declaring only what we
 * consume means an addition upstream cannot break the parse, and marking it all
 * optional forces the projection below to decide what to do about a missing
 * value instead of trusting the shape.
 */
interface EcontRawCity {
  id?: number
  name?: string
  nameEn?: string
  postCode?: string
}

interface EcontRawOffice {
  /** The waybill reference (`receiverOfficeCode`), not the internal `id`. */
  code?: string
  name?: string
  nameEn?: string
  /** Automated parcel station — Еконтомат. */
  isAPS?: boolean
  /** Mobile post station: a van on a route, not somewhere to collect. */
  isMPS?: boolean
  address?: {
    fullAddress?: string
    fullAddressEn?: string
    city?: EcontRawCity
  }
  normalBusinessHoursFrom?: number
  normalBusinessHoursTo?: number
  shipmentTypes?: string[]
}

interface EcontOfficesResponse {
  offices?: EcontRawOffice[]
}

/** One line of a priced parcel: a courier service, a fee or a surcharge. */
interface EcontRawService {
  /** `'C'` courier service, `'CD'` наложен платеж fee. Others exist. */
  type?: string
  description?: string
  price?: number
  currency?: string
  paymentSide?: string
}

interface EcontLabelResponse {
  label?: {
    totalPrice?: number
    currency?: string
    services?: EcontRawService[]
  }
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: COURIER_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * `1789538400000` → `'09:00'`.
 *
 * The value is a full timestamp whose date part is meaningless — Econt encodes
 * a time of day as "that time, today". Only the Sofia wall clock matters, so
 * the date is discarded and the zone is fixed rather than taken from the
 * server, which is UTC in production and would render every office an hour or
 * three early.
 */
function formatHours(from?: number, to?: number): string | undefined {
  if (!from || !to || from === to) return undefined

  return `${timeFormatter.format(from)}–${timeFormatter.format(to)}`
}

/**
 * One raw office to ours, or `null` to drop it.
 *
 * Dropping is the right answer for a record we cannot address a parcel to. An
 * office with no code cannot go on a waybill, and one with no post code cannot
 * be matched against what the customer typed — offering either produces an
 * order that fails at the label stage, which is the exact outcome the
 * `unconfigured` fallback exists to avoid.
 */
function toOffice(raw: EcontRawOffice): CourierOffice | null {
  const city = raw.address?.city

  if (!raw.code || !raw.name || !city?.id || !city.postCode) return null

  // A mobile station is a van on a delivery round; a customer cannot walk up to
  // it. We only offer staffed offices and lockers.
  if (raw.isMPS) return null

  // `shipmentTypes` distinguishes a parcel office from a pallet or cargo depot.
  // Treated as an allow-list only when present: if Econt stops sending the
  // field, silently hiding every office would be worse than showing a few that
  // turn out to be cargo-only.
  if (raw.shipmentTypes && !raw.shipmentTypes.includes('courier')) return null

  return {
    id: raw.code,
    courier: COURIER,
    kind: raw.isAPS ? 'locker' : 'office',
    name: raw.name,
    nameEn: raw.nameEn || undefined,
    // `fullAddress` has a leading space in the live data; trim rather than
    // render it into the picker.
    address: raw.address?.fullAddress?.trim() || '',
    addressEn: raw.address?.fullAddressEn?.trim() || undefined,
    cityId: String(city.id),
    cityName: city.name ?? '',
    cityNameEn: city.nameEn || undefined,
    postCode: city.postCode,
    hours: formatHours(raw.normalBusinessHoursFrom, raw.normalBusinessHoursTo),
  }
}

/**
 * Fold the office list into its distinct cities, ordered for a picker.
 *
 * Sorted with the Bulgarian collator: `localeCompare` under the default locale
 * puts Cyrillic in code-point order, which is *nearly* alphabetical and so
 * looks correct until a customer scrolls past а/б and finds it is not.
 */
function citiesOf(offices: readonly CourierOffice[]): CourierCity[] {
  const byId = new Map<string, CourierCity>()

  for (const office of offices) {
    if (!byId.has(office.cityId)) {
      byId.set(office.cityId, {
        id: office.cityId,
        name: office.cityName,
        nameEn: office.cityNameEn,
        postCode: office.postCode,
      })
    }
  }

  const collator = new Intl.Collator('bg')

  return [...byId.values()].sort((a, b) => collator.compare(a.name, b.name))
}

/** Case- and accent-insensitive contains, for the city search box. */
function matches(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase('bg').includes(needle)
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/** Service line that is the наложен платеж fee rather than the carriage. */
const COD_SERVICE_TYPE = 'CD'

/** What goes on the parcel as its description. Not priced on, but required. */
const SHIPMENT_DESCRIPTION = 'Ароматни свещи'

/** Minor units per euro. Local, so this file needs nothing from `money.ts` but types. */
const MINOR_PER_MAJOR = 100

/**
 * A courier's decimal amount to `Money`.
 *
 * Deliberately not `eur()`, which throws on a third decimal place. That is right
 * for prices *we* author — a typo should fail loudly — and wrong for a number
 * arriving over the network, where an exception would escape into a checkout
 * request. So this rounds to the cent and returns `null` for anything that is
 * not a usable amount, leaving the caller to report a failure.
 */
function toMoney(value: unknown, currency: unknown): Money | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null

  // A quote in another currency is not converted here. The statutory BGN rate is
  // fixed, but applying it silently would put a number on the checkout that the
  // courier's invoice does not contain. Econt has been EUR-only since
  // 2026-01-01; anything else means something changed and we should say so.
  if (typeof currency === 'string' && currency !== CURRENCY) return null

  return money(Math.round(value * MINOR_PER_MAJOR))
}

/**
 * The destination half of a quote request.
 *
 * Returns `null` when the delivery details cannot address a parcel — an office
 * method with no code, a door method with no city. The action validates both
 * before reaching here, so this is the belt to that braces.
 */
function destinationOf(request: ShipmentQuoteRequest): Record<string, unknown> | null {
  if (request.method === 'door') {
    const address = request.address
    if (!address?.city || !address.postCode || !address.street) return null

    return {
      receiverAddress: {
        // `city` needs a name *and* a post code: Econt matches on both and
        // refuses a bare post code shared by several settlements.
        city: { name: address.city, postCode: address.postCode },
        fullAddress: address.street,
      },
    }
  }

  if (!request.officeId) return null

  return { receiverOfficeCode: request.officeId }
}

function originOf(shipFrom: EcontShipFrom): Record<string, unknown> | null {
  if (shipFrom.officeCode) return { senderOfficeCode: shipFrom.officeCode }

  if (!shipFrom.city || !shipFrom.postCode || !shipFrom.street) return null

  return {
    senderAddress: {
      city: { name: shipFrom.city, postCode: shipFrom.postCode },
      fullAddress: shipFrom.street,
    },
  }
}

/** Grams to the kilograms Econt prices on. */
const GRAMS_PER_KG = 1000

/**
 * A quote runs inside a checkout submission, so it gets a tighter budget than
 * the office list: three attempts at 4 s is still under the platform's function
 * limit, and a customer waiting on a submit button notices 24 s.
 */
const QUOTE_TIMEOUT_MS = 4_000

function quoteBody(
  request: ShipmentQuoteRequest,
  shipFrom: EcontShipFrom
): Record<string, unknown> | null {
  const origin = originOf(shipFrom)
  const destination = destinationOf(request)

  if (!origin || !destination) return null

  return {
    label: {
      ...origin,
      ...destination,
      packCount: 1,
      shipmentType: 'pack',
      weight: request.weightGrams / GRAMS_PER_KG,
      shipmentDescription: SHIPMENT_DESCRIPTION,
      ...(request.codAmount
        ? {
            services: {
              cdAmount: request.codAmount.amountMinor / MINOR_PER_MAJOR,
              // `get` — the courier collects the amount and remits it to us.
              cdType: 'get',
              cdCurrency: request.codAmount.currency,
            },
            // The customer pays the courier in cash on delivery, which is what
            // наложен платеж is. Only the per-service `price` values are read
            // below, so this decides who Econt bills, not what it charges.
            paymentReceiverMethod: 'cash',
          }
        : {}),
    },
    mode: 'calculate',
  }
}

/**
 * The priced response to a `ShipmentRate`.
 *
 * Rules, in order of how much they matter:
 *
 * 1. **`totalPrice` is the truth about the total.** Whatever the breakdown adds
 *    up to, this is the figure Econt stands behind, so the returned `total` is
 *    always it and `delivery + codFee` is made to reconcile with it.
 * 2. **Only `CD` is the COD fee.** Every other line — carriage, and any
 *    surcharge Econt adds tomorrow that we have never seen — counts as delivery.
 *    An unrecognised line therefore lands on the half the customer pays rather
 *    than being dropped, because a charge we silently absorb is a loss per
 *    parcel that nothing in the system would ever report.
 * 3. **No breakdown with COD requested is a failure.** The fee is in the total
 *    and we cannot tell how much of it, and splitting by guess would either
 *    charge the customer our fee or hide a cost. With no COD there is nothing to
 *    separate, so the total *is* the delivery price.
 */
function toRate(response: EcontLabelResponse, hasCod: boolean): LookupResult<ShipmentRate> {
  const failed = (reason: string): LookupResult<ShipmentRate> => ({
    status: 'failed',
    courier: COURIER,
    reason,
  })

  const label = response.label

  if (!label) return failed('the quote came back without a label')

  const total = toMoney(label.totalPrice, label.currency)

  if (!total) {
    return failed(
      `the quote came back with no usable price (${String(label.totalPrice)} ${String(label.currency)})`
    )
  }

  const services = label.services ?? []

  if (services.length === 0) {
    if (hasCod) {
      return failed('the quote came back without a breakdown, so the COD fee cannot be separated')
    }

    return { status: 'ok', data: { delivery: total, codFee: money(0), total } }
  }

  let delivery = money(0)
  let codFee = money(0)
  const carriage: string[] = []

  for (const service of services) {
    const price = toMoney(service.price, service.currency)

    if (!price) {
      return failed(
        `a service line has no usable price (${String(service.type)} ${String(service.price)} ${String(service.currency)})`
      )
    }

    if (service.type === COD_SERVICE_TYPE) {
      codFee = money(codFee.amountMinor + price.amountMinor)
      continue
    }

    delivery = money(delivery.amountMinor + price.amountMinor)
    if (service.description) carriage.push(service.description)
  }

  const unattributed = total.amountMinor - delivery.amountMinor - codFee.amountMinor

  if (unattributed !== 0) {
    // Not fatal: `totalPrice` is authoritative, so the difference is absorbed
    // into the delivery charge rather than left to make the order not add up.
    // Logged because it means the breakdown grew a line we do not understand.
    console.warn(
      `[econt] priced ${total.amountMinor} minor units but the breakdown accounts for ` +
        `${delivery.amountMinor + codFee.amountMinor}; putting the difference on delivery`
    )
    delivery = money(delivery.amountMinor + unattributed)
  }

  if (delivery.amountMinor < 0) {
    return failed('the breakdown implies a negative delivery charge')
  }

  return {
    status: 'ok',
    data: {
      delivery,
      codFee,
      total,
      ...(carriage.length > 0 ? { description: carriage.join('; ') } : {}),
    },
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** How many cities a search returns. Enough to choose from, not to scroll. */
const MAX_CITY_RESULTS = 20

/** Shortest query worth sending. One letter matches most of the country. */
const MIN_QUERY_LENGTH = 2

interface CacheEntry {
  offices: CourierOffice[]
  fetchedAt: number
}

export function createEcontClient(config: EcontConfig): CourierClient {
  let cached: CacheEntry | undefined
  /**
   * The in-flight request, so a page that resolves a city list and an office
   * list at once issues one 1.7 MB download instead of two. Cleared in
   * `finally` — a retained rejected promise would cache the failure forever.
   */
  let inFlight: Promise<LookupResult<CourierOffice[]>> | undefined

  async function load(): Promise<LookupResult<CourierOffice[]>> {
    const response = await postJson<EcontOfficesResponse>({
      url: `${config.baseUrl}/Nomenclatures/NomenclaturesService.getOffices.json`,
      body: { countryCode: 'BGR' },
    })

    if (!response.ok) {
      return { status: 'failed', courier: COURIER, reason: response.reason }
    }

    const offices = (response.data.offices ?? [])
      .map(toOffice)
      .filter((office): office is CourierOffice => office !== null)

    if (offices.length === 0) {
      // A 200 with nothing usable is a failure, not an empty country. Reporting
      // it as `ok: []` would render an empty picker with no explanation.
      return {
        status: 'failed',
        courier: COURIER,
        reason: 'the office list came back empty',
      }
    }

    cached = { offices, fetchedAt: Date.now() }

    return { status: 'ok', data: offices }
  }

  /**
   * The office list, from cache when it is fresh.
   *
   * In-process, so on a serverless platform each cold instance pays for one
   * download. That is the right trade for now — a shared cache would mean
   * another service to run for 1.7 MB of public data. If cold-start latency
   * shows up in the checkout timings, move this behind the platform's cache and
   * keep the seam here.
   */
  async function nomenclature(): Promise<LookupResult<CourierOffice[]>> {
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { status: 'ok', data: cached.offices }
    }

    inFlight ??= load().finally(() => {
      inFlight = undefined
    })

    return inFlight
  }

  return {
    courier: COURIER,

    async searchCities(query) {
      const needle = query.trim().toLocaleLowerCase('bg')

      if (needle.length < MIN_QUERY_LENGTH) return { status: 'ok', data: [] }

      const result = await nomenclature()
      if (result.status !== 'ok') return result

      const found = citiesOf(result.data).filter(
        (city) =>
          matches(city.name, needle) ||
          city.postCode.startsWith(needle) ||
          (city.nameEn ? matches(city.nameEn, needle) : false)
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
      const shipFrom = config.shipFrom?.() ?? null

      // Both are needed and neither can be substituted: without credentials the
      // endpoint answers 517, and without a hand-over point any price we got
      // would be for a parcel posted from somewhere we are not.
      if (!credentials || !shipFrom) return { status: 'unconfigured', courier: COURIER }

      const body = quoteBody(request, shipFrom)

      if (!body) {
        return {
          status: 'failed',
          courier: COURIER,
          reason: 'the parcel has no addressable origin or destination',
        }
      }

      const response = await postJson<EcontLabelResponse>({
        url: `${config.baseUrl}/Shipments/LabelService.createLabel.json`,
        body,
        auth: credentials,
        // Shorter than the nomenclature's default: this one runs inside a
        // checkout submission with a customer watching, and a slow quote should
        // become a plain "try again" rather than a spinner the platform kills.
        timeoutMs: QUOTE_TIMEOUT_MS,
      })

      if (!response.ok) {
        return { status: 'failed', courier: COURIER, reason: response.reason }
      }

      return toRate(response.data, request.codAmount !== null)
    },
  }
}
