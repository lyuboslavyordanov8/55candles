import 'server-only'

import { CURRENCY, money, type Money } from '../money'
import type { Courier } from '../shipping'
import { requestJson, type HttpResult } from './http'
import type {
  CourierCity,
  CourierClient,
  CourierOffice,
  LookupResult,
  ParcelDestination,
  ShipmentQuoteRequest,
  ShipmentRate,
  ShipmentTracking,
  TrackingEvent,
  TrackingReport,
  Waybill,
  WaybillRequest,
} from './types'

/**
 * Pigeon Express REST API client.
 *
 * Written on 2026-09-24 from the published OpenAPI document
 * (`https://api-docs.pigeonexpress.com/openapi.yaml`, dated 2026-08-21) and the
 * company's own WooCommerce plugin, **before any key existed to test with**.
 * Every endpoint answers `401` without one, so none of the shapes below have
 * been seen live yet. Verify them against the sandbox
 * (`https://api-demo.pigeonexpress.com/v1`, `PIGEON_ENV=sandbox`) before the
 * courier is made bookable.
 *
 * ## How Pigeon differs from Econt and Speedy
 *
 * 1. **REST, not RPC.** Lookups are `GET` with a query, writes are `POST`, and
 *    the key pair travels in `X-API-Key` / `X-API-Secret` headers.
 *
 * 2. **Errors are an envelope**, `{ success: false, message, errors? }`, usually
 *    with a 4xx — `422` for validation, `404` for a shipment that is not ours.
 *    `success: false` is treated as a failure whatever the status, which is
 *    what the official plugin does.
 *
 * 3. **Nothing is public**, as with Speedy: without keys there is no office list,
 *    so the picker is gated on configuration — see `couriersWithOfficeLookup()`.
 *
 * 4. **The quote has no COD line.** `/shipments/calculate` answers
 *    `shipping_price`, `total_service_fees` and `total_price`, and nothing says
 *    how much of the fees is the наложен платеж. So a COD parcel is priced
 *    twice, with and without `cod_amount`, and the difference is the COD fee.
 *    That keeps any fuel or other surcharge on the delivery half, where it
 *    belongs (see `toRate` in `speedy.ts` for the same rule).
 *
 * 5. **A door delivery needs Pigeon's city id**, not a name. The customer types
 *    a settlement and post code; `resolveCity()` looks it up in `/cities` and
 *    refuses to guess between two matches. The street goes in
 *    `additional_info` as typed, the same free-text choice as for the other two.
 *
 * 6. **The label is bytes behind the keys.** `/shipments/{ref}/label` needs the
 *    same headers as everything else, so there is no link to store. The admin's
 *    label route asks `labelPdf()` for it instead.
 *
 * The sender is the account the keys belong to — its name and phone come from
 * the Pigeon profile, not from a request. The only thing to configure is where
 * parcels are handed over: an office, or an address.
 */

/**
 * Where parcels are handed over to Pigeon.
 *
 * `officeId` — dropped at that office. Otherwise `cityId` + `address`, a
 * collection from there. Changes the price, so it is configuration, not a
 * default: see `pigeonPickup()` in `./index.ts`.
 */
export type PigeonPickup = { officeId: number } | { cityId: number; address: string }

export interface PigeonConfig {
  baseUrl: string
  /**
   * The key pair, or `null` while either half is unset. A function for the
   * same reason as Econt's and Speedy's: the client is cached, the environment
   * is read per call.
   */
  credentials?: () => { key: string; secret: string } | null
  pickup?: () => PigeonPickup | null
}

const COURIER: Courier = 'pigeon'

/** Every request says who is calling, as the plugin does. Pigeon logs it. */
const PLATFORM = '55candles'

/** What goes on the waybill as its contents. Required: at least one item. */
const INVENTORY_DESCRIPTION = 'Ароматни свещи'

/** The only service this shop prices and books. `express` is a different tariff. */
const SERVICE_TYPE = 'standard'

/**
 * Who pays Pigeon for carrying the parcel: **the shop**, as for the other two
 * couriers. The customer paid delivery inside the order total, so the amount
 * handed over at the door is the COD amount and nothing more.
 */
const WHO_PAYS = 'sender'

/** Pigeon's own limits on one package, in kg. */
const MIN_WEIGHT_KG = 0.1
const MAX_WEIGHT_KG = 30

/** Page size for the office list. The API's own maximum. */
const PER_PAGE = 100

/**
 * A ceiling on office-list pages, so a pagination bug upstream cannot loop
 * forever. 50 × 100 is well past any Bulgarian network.
 */
const MAX_PAGES = 50

/** Six hours, as for the others: offices change on a scale of weeks. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

const QUOTE_TIMEOUT_MS = 4_000

/** A booking is billable: time to answer, and **never retried**. */
const BOOKING_TIMEOUT_MS = 15_000
const BOOKING_ATTEMPTS = 1

const LABEL_TIMEOUT_MS = 10_000

/** Bulk tracking takes at most this many references per request. */
const TRACK_BATCH = 100

/**
 * How far back the COD payout report is read. The API refuses a range longer
 * than one month, and a parcel still being followed was paid within that.
 */
const PAYOUT_WINDOW_DAYS = 30

const MINOR_PER_MAJOR = 100

// ---------------------------------------------------------------------------
// Wire types — only the fields we read, every one optional
// ---------------------------------------------------------------------------

interface PigeonEnvelope {
  success?: boolean
  message?: string
  errors?: Record<string, unknown>
}

interface PigeonPage<T> extends PigeonEnvelope {
  data?: T[]
  meta?: { current_page?: number; last_page?: number }
}

interface PigeonRawCity {
  id?: number
  name?: string
  name_en?: string | null
  type?: string
  postal_code?: string
}

/**
 * The schema calls `working_hours` an array of `{ day, open, close,
 * is_closed }`; the example in the same document is an object keyed by day with
 * `{ open, close }` or `null`. Both are read.
 */
type PigeonRawHours =
  | { day?: string; open?: string; close?: string; is_closed?: boolean }[]
  | Record<string, { open?: string; close?: string } | null>

interface PigeonRawOffice {
  /** The id `delivery_office_id` expects. */
  id?: number
  name?: string
  code?: string
  type?: string
  address?: string
  city?: PigeonRawCity
  postal_code?: string
  working_hours?: PigeonRawHours | null
}

interface PigeonCalculation extends PigeonEnvelope {
  data?: {
    shipping_price?: number
    total_service_fees?: number
    total_price?: number
    currency?: string
  }
}

interface PigeonCreated extends PigeonEnvelope {
  data?: {
    reference_number?: string
    status?: string
  }
}

interface PigeonRawTrackingEvent {
  status?: string
  status_code?: string
  note?: string | null
  created_at?: string
}

interface PigeonRawTracking {
  found?: boolean
  error?: string
  reference_number?: string
  status?: string
  status_code?: string
  expected_delivery_date?: string | null
  delivery_date?: string | null
  tracking?: PigeonRawTrackingEvent[]
  chain_after?: { reference_number?: string }[]
}

interface PigeonBulkTracking extends PigeonEnvelope {
  data?: Record<string, PigeonRawTracking | undefined>
}

interface PigeonPayoutRow {
  waybill?: string
  collected_date?: string
  paid_date?: string
  amount_eur?: string
}

interface PigeonPayouts extends PigeonEnvelope {
  data?: { rows?: PigeonPayoutRow[] } | PigeonPayoutRow[]
  rows?: PigeonPayoutRow[]
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * One line of opening hours, taken from Monday: the picker shows one range, as
 * Speedy's weekday `workingTimeFrom`/`To` do. Absent rather than guessed.
 */
function formatHours(hours: PigeonRawOffice['working_hours']): string | undefined {
  if (!hours) return undefined

  const monday = Array.isArray(hours)
    ? hours.find((entry) => entry.day === 'monday' && !entry.is_closed)
    : hours.monday

  if (!monday?.open || !monday.close || monday.open === monday.close) return undefined

  return `${monday.open.slice(0, 5)}–${monday.close.slice(0, 5)}`
}

function kindOf(type: string | undefined): CourierOffice['kind'] | null {
  if (type === 'office') return 'office'
  if (type === 'locker') return 'locker'

  return null
}

/** One raw office to ours, or `null` for a record no parcel can be sent to. */
function toOffice(raw: PigeonRawOffice): CourierOffice | null {
  const kind = kindOf(raw.type)
  const cityId = raw.city?.id
  const postCode = raw.postal_code?.trim() || raw.city?.postal_code?.trim()

  if (!kind || !raw.id || !raw.name || !cityId || !postCode) return null

  return {
    id: String(raw.id),
    courier: COURIER,
    kind,
    name: raw.name.trim(),
    address: raw.address?.trim() ?? '',
    cityId: String(cityId),
    cityName: raw.city?.name?.trim() ?? '',
    ...(raw.city?.name_en ? { cityNameEn: raw.city.name_en } : {}),
    postCode,
    hours: formatHours(raw.working_hours),
  }
}

/** The distinct cities of the office list, in Bulgarian alphabetical order. */
function citiesOf(offices: readonly CourierOffice[]): CourierCity[] {
  const byId = new Map<string, CourierCity>()

  for (const office of offices) {
    if (!byId.has(office.cityId)) {
      byId.set(office.cityId, {
        id: office.cityId,
        name: office.cityName,
        postCode: office.postCode,
        ...(office.cityNameEn ? { nameEn: office.cityNameEn } : {}),
      })
    }
  }

  const collator = new Intl.Collator('bg')

  return [...byId.values()].sort((a, b) => collator.compare(a.name, b.name))
}

/** A courier amount to `Money`, `null` for anything unusable or not in euro. */
function toMoney(value: unknown, currency: unknown): Money | null {
  const number = typeof value === 'string' ? Number(value) : value

  if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) return null
  if (typeof currency === 'string' && currency !== CURRENCY) return null

  return money(Math.round(number * MINOR_PER_MAJOR))
}

/** `2026-02-27T00:00:00+02:00` → `2026-02-27`. */
function toDate(value: string | null | undefined): string | undefined {
  const date = value?.trim().slice(0, 10)

  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
}

/** A timestamp as ISO, or `undefined` for one that does not parse. */
function toInstant(value: string | null | undefined): string | undefined {
  if (!value) return undefined

  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

/**
 * The payout report's `d-m-Y` to an instant. The report has no time of day, so
 * noon Sofia time stands in — the day is what matters, and noon cannot slip to
 * the neighbouring date in any time zone the admin reads it in.
 */
function fromDmy(value: string | undefined): string | undefined {
  const match = value?.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!match) return undefined

  const [, day, month, year] = match

  return toInstant(`${year}-${month}-${day}T12:00:00+03:00`)
}

/** Our `+359…` to the digits-only `359…` form the plugin sends. */
function phoneOf(phone: string): string {
  const digits = phone.replace(/\D/g, '')

  if (digits.startsWith('00359')) return digits.slice(2)
  if (digits.length === 10 && digits.startsWith('0')) return `359${digits.slice(1)}`

  return digits
}

/** Grams to Pigeon's kilograms, inside the range it accepts. */
function weightOf(weightGrams: number): number {
  const kg = Math.round(weightGrams) / 1000

  return Math.min(Math.max(kg, MIN_WEIGHT_KG), MAX_WEIGHT_KG)
}

function officeIdOf(officeId: string | undefined): number | null {
  if (!officeId) return null

  const parsed = Number(officeId)

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/** `гр. София` / `с. Равда` → `София` / `Равда`, for the city search. */
function bareCityName(city: string): string {
  return city
    .trim()
    .replace(/^(гр|град|с|село|к\.к)\.?\s+/i, '')
    .trim()
}

/** The human part of an error envelope: the field errors when there are any. */
function reasonOf(envelope: PigeonEnvelope | undefined): string {
  const errors = envelope?.errors

  if (errors && typeof errors === 'object') {
    const pieces = Object.entries(errors).map(([field, messages]) => {
      const text = Array.isArray(messages) ? messages.map(String).join(' ') : String(messages)
      return `${field}: ${text}`
    })

    if (pieces.length > 0) return pieces.join('; ')
  }

  return envelope?.message?.trim() || 'the courier reported an error'
}

/** Public tracking page, ready to send to a customer. */
export function pigeonTrackingUrl(referenceNumber: string): string {
  return `https://track.pigeonexpress.com/?tracking_number=${encodeURIComponent(referenceNumber)}`
}

/** One found parcel to our shape. */
function toTracking(
  number: string,
  raw: PigeonRawTracking,
  payout: PigeonPayoutRow | undefined
): ShipmentTracking {
  const events: TrackingEvent[] = (raw.tracking ?? [])
    .map((event) => {
      const at = toInstant(event.created_at)
      const text = [event.status?.trim(), event.note?.trim()].filter(Boolean).join(' — ')
      return at && text ? { at, text } : null
    })
    .filter((event): event is TrackingEvent => event !== null)
    // Newest first, whatever order the API lists them in.
    .sort((a, b) => b.at.localeCompare(a.at))

  const deliveredAt = toInstant(raw.delivery_date)
  const expected = toDate(raw.expected_delivery_date)
  const followedBy = raw.chain_after?.find((next) => next.reference_number)?.reference_number

  const amount = toMoney(payout?.amount_eur, CURRENCY)
  const collectedAt = fromDmy(payout?.collected_date)
  const paidAt = fromDmy(payout?.paid_date)

  return {
    number,
    status: raw.status?.trim() || events[0]?.text || 'без статус',
    events,
    ...(deliveredAt ? { deliveredAt } : {}),
    ...(expected ? { expectedDeliveryDate: expected } : {}),
    ...(amount && collectedAt ? { codCollected: { amount, at: collectedAt } } : {}),
    ...(amount && paidAt ? { codPaid: { amount, at: paidAt } } : {}),
    ...(followedBy ? { followedBy } : {}),
  }
}

/** `YYYY-MM-DD` in Sofia, `days` ago. */
function sofiaDate(daysAgo: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000))
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const MAX_CITY_RESULTS = 20
const MIN_QUERY_LENGTH = 2

const PDF_SIGNATURE = '%PDF'

interface CacheEntry {
  offices: CourierOffice[]
  fetchedAt: number
}

export function createPigeonClient(config: PigeonConfig): CourierClient {
  let cached: CacheEntry | undefined
  let inFlight: Promise<LookupResult<CourierOffice[]>> | undefined

  /** Resolved door-delivery cities, `city|postCode` → Pigeon city id. */
  const cityIds = new Map<string, number>()

  const unconfigured = <T,>(): LookupResult<T> => ({ status: 'unconfigured', courier: COURIER })

  const failed = <T,>(reason: string): LookupResult<T> => ({
    status: 'failed',
    courier: COURIER,
    reason,
  })

  function headersFor(credentials: { key: string; secret: string }): Record<string, string> {
    return {
      'X-API-Key': credentials.key,
      'X-API-Secret': credentials.secret,
      'X-Platform': PLATFORM,
    }
  }

  /**
   * One call, with the envelope checked. A `success: false` inside a `2xx` is a
   * failure; an HTTP failure keeps `requestJson`'s reason, which already carries
   * the start of the body.
   */
  async function call<T extends PigeonEnvelope>(
    credentials: { key: string; secret: string },
    options: {
      method: 'GET' | 'POST'
      path: string
      query?: Record<string, string | number | undefined>
      body?: unknown
      timeoutMs?: number
      attempts?: number
    }
  ): Promise<HttpResult<T>> {
    const response = await requestJson<T>({
      method: options.method,
      url: `${config.baseUrl}${options.path}`,
      query: options.query,
      body: options.body,
      headers: headersFor(credentials),
      timeoutMs: options.timeoutMs,
      attempts: options.attempts,
    })

    if (!response.ok) return response

    if (response.data?.success === false) return { ok: false, reason: reasonOf(response.data) }

    return response
  }

  async function load(credentials: { key: string; secret: string }) {
    const raw: PigeonRawOffice[] = []

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const response = await call<PigeonPage<PigeonRawOffice>>(credentials, {
        method: 'GET',
        path: '/offices',
        query: { page, per_page: PER_PAGE },
      })

      if (!response.ok) return failed<CourierOffice[]>(response.reason)

      raw.push(...(response.data.data ?? []))

      const last = response.data.meta?.last_page ?? page
      if (page >= last) break
    }

    const offices = raw
      .map(toOffice)
      .filter((office): office is CourierOffice => office !== null)

    if (offices.length === 0) return failed<CourierOffice[]>('the office list came back empty')

    cached = { offices, fetchedAt: Date.now() }

    return { status: 'ok', data: offices } as LookupResult<CourierOffice[]>
  }

  async function nomenclature(): Promise<LookupResult<CourierOffice[]>> {
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { status: 'ok', data: cached.offices }
    }

    const credentials = config.credentials?.() ?? null
    if (!credentials) return unconfigured()

    inFlight ??= load(credentials).finally(() => {
      inFlight = undefined
    })

    return inFlight
  }

  /**
   * Pigeon's id for the settlement a customer typed, or a reason it has none.
   *
   * Matched on the name *and* the post code. One exact match wins; several are
   * refused rather than guessed between, because a guess is a parcel sent to
   * the wrong village of the same name.
   */
  async function resolveCity(
    credentials: { key: string; secret: string },
    city: string,
    postCode: string
  ): Promise<{ ok: true; id: number } | { ok: false; reason: string }> {
    const name = bareCityName(city)
    const key = `${name.toLocaleLowerCase('bg')}|${postCode}`

    const known = cityIds.get(key)
    if (known) return { ok: true, id: known }

    const response = await call<PigeonPage<PigeonRawCity>>(credentials, {
      method: 'GET',
      path: '/cities',
      query: { name, postal_code: postCode, per_page: PER_PAGE },
      timeoutMs: QUOTE_TIMEOUT_MS,
    })

    if (!response.ok) return { ok: false, reason: response.reason }

    const wanted = name.toLocaleLowerCase('bg')
    const candidates = (response.data.data ?? []).filter(
      (candidate) => candidate.id && candidate.postal_code === postCode
    )
    const exact = candidates.filter(
      (candidate) => candidate.name?.trim().toLocaleLowerCase('bg') === wanted
    )
    const pick = exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : null

    if (!pick?.id) {
      return {
        ok: false,
        reason:
          candidates.length > 1
            ? `more than one settlement matches "${city}" ${postCode}`
            : `Pigeon Express does not deliver to "${city}" ${postCode}`,
      }
    }

    cityIds.set(key, pick.id)

    return { ok: true, id: pick.id }
  }

  function pickupOf(pickup: PigeonPickup): Record<string, unknown> {
    if ('officeId' in pickup) {
      return { pickup_type: 'office', pickup_office_id: pickup.officeId }
    }

    return {
      pickup_type: 'address',
      pickup_address: { city_id: pickup.cityId, additional_info: pickup.address },
    }
  }

  /** The delivery half of a request, or a reason there cannot be one. */
  async function deliveryOf(
    credentials: { key: string; secret: string },
    destination: ParcelDestination,
    forWaybill: boolean
  ): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; reason: string }> {
    if (destination.method === 'door') {
      const address = destination.address
      if (!address?.city || !address.postCode) {
        return { ok: false, reason: 'the parcel has no addressable destination' }
      }

      const city = await resolveCity(credentials, address.city, address.postCode)
      if (!city.ok) return city

      // A quote depends on the settlement only; the street is sent when there
      // is a parcel to deliver. `additional_info` is required without a
      // `street_id`, at least three characters.
      const street = address.street?.trim() ?? ''
      if (forWaybill && street.length < 3) {
        return { ok: false, reason: 'the street address is too short for Pigeon Express' }
      }

      return {
        ok: true,
        body: {
          delivery_type: 'address',
          delivery_address: {
            city_id: city.id,
            postal_code: address.postCode,
            additional_info: forWaybill ? street : '---',
          },
        },
      }
    }

    const officeId = officeIdOf(destination.officeId)
    if (!officeId) return { ok: false, reason: 'the parcel has no addressable destination' }

    return {
      ok: true,
      body: { delivery_type: destination.method, delivery_office_id: officeId },
    }
  }

  function codOf(codAmount: Money | null): Record<string, unknown> {
    return codAmount
      ? { service_codes: { cod_amount: codAmount.amountMinor / MINOR_PER_MAJOR } }
      : {}
  }

  async function calculate(
    credentials: { key: string; secret: string },
    body: Record<string, unknown>
  ): Promise<{ ok: true; total: Money } | { ok: false; reason: string }> {
    const response = await call<PigeonCalculation>(credentials, {
      method: 'POST',
      path: '/shipments/calculate',
      body,
      timeoutMs: QUOTE_TIMEOUT_MS,
    })

    if (!response.ok) return response

    const total = toMoney(response.data.data?.total_price, response.data.data?.currency)

    if (!total) {
      return {
        ok: false,
        reason: `the quote came back with no usable price (${String(response.data.data?.total_price)})`,
      }
    }

    return { ok: true, total }
  }

  /** Recently paid-out наложен платеж, by waybill. Best-effort: empty on failure. */
  async function payouts(
    credentials: { key: string; secret: string }
  ): Promise<Map<string, PigeonPayoutRow>> {
    const response = await call<PigeonPayouts>(credentials, {
      method: 'GET',
      path: '/payments/completed',
      query: { from_date: sofiaDate(PAYOUT_WINDOW_DAYS), to_date: sofiaDate(0) },
      attempts: 1,
    })

    const byWaybill = new Map<string, PigeonPayoutRow>()
    if (!response.ok) return byWaybill

    const data = response.data.data
    const rows = Array.isArray(data) ? data : (data?.rows ?? response.data.rows ?? [])

    for (const row of rows) {
      if (row.waybill) byWaybill.set(row.waybill.trim(), row)
    }

    return byWaybill
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
          city.name.toLocaleLowerCase('bg').includes(needle) || city.postCode.startsWith(needle)
      )

      return { status: 'ok', data: found.slice(0, MAX_CITY_RESULTS) }
    },

    async officesIn(cityId, kind) {
      const result = await nomenclature()
      if (result.status !== 'ok') return result

      const collator = new Intl.Collator('bg')

      return {
        status: 'ok',
        data: result.data
          .filter((office) => office.cityId === cityId && office.kind === kind)
          .sort((a, b) => collator.compare(a.name, b.name)),
      }
    },

    async findOffice(id) {
      const result = await nomenclature()
      if (result.status !== 'ok') return result

      return { status: 'ok', data: result.data.find((office) => office.id === id) ?? null }
    },

    async priceShipment(request: ShipmentQuoteRequest) {
      const credentials = config.credentials?.() ?? null
      const pickup = config.pickup?.() ?? null
      if (!credentials || !pickup) return unconfigured()

      const delivery = await deliveryOf(credentials, request, false)
      if (!delivery.ok) return failed(delivery.reason)

      const base = {
        ...pickupOf(pickup),
        ...delivery.body,
        packages: [{ weight: weightOf(request.weightGrams) }],
        service_type: SERVICE_TYPE,
        who_pays: WHO_PAYS,
      }

      if (!request.codAmount) {
        const priced = await calculate(credentials, base)
        if (!priced.ok) return failed(priced.reason)

        const rate: ShipmentRate = { delivery: priced.total, codFee: money(0), total: priced.total }
        return { status: 'ok', data: rate }
      }

      // Priced twice, in parallel: the answer has no COD line — see the header.
      const [withCod, without] = await Promise.all([
        calculate(credentials, { ...base, ...codOf(request.codAmount) }),
        calculate(credentials, base),
      ])

      if (!withCod.ok) return failed(withCod.reason)
      if (!without.ok) return failed(without.reason)

      const fee = withCod.total.amountMinor - without.total.amountMinor

      if (fee < 0) return failed('the price with наложен платеж came back lower than without it')

      return {
        status: 'ok',
        data: { delivery: without.total, codFee: money(fee), total: withCod.total },
      }
    },

    async createWaybill(request: WaybillRequest) {
      const credentials = config.credentials?.() ?? null
      const pickup = config.pickup?.() ?? null
      if (!credentials || !pickup) return unconfigured()

      const delivery = await deliveryOf(credentials, request, true)
      if (!delivery.ok) return failed(delivery.reason)

      const response = await call<PigeonCreated>(credentials, {
        method: 'POST',
        path: '/shipments',
        body: {
          receiver_name: request.recipient.name,
          receiver_phone: phoneOf(request.recipient.phone),
          ...(request.recipient.email ? { receiver_email: request.recipient.email } : {}),
          ...pickupOf(pickup),
          ...delivery.body,
          packages: [{ weight: weightOf(request.weightGrams) }],
          inventory_items: [{ description: INVENTORY_DESCRIPTION, quantity: 1 }],
          service_type: SERVICE_TYPE,
          who_pays: WHO_PAYS,
          ...codOf(request.codAmount),
          // Our order number, in Pigeon's record and back in its tracking and
          // payout reports, so a parcel or a payment can be traced to an order.
          external_reference: request.orderNumber,
        },
        timeoutMs: BOOKING_TIMEOUT_MS,
        attempts: BOOKING_ATTEMPTS,
      })

      if (!response.ok) return failed(response.reason)

      const number = response.data.data?.reference_number?.trim()

      if (!number) {
        console.error(
          `[pigeon] shipment answered with no reference number for order ${request.orderNumber}: ` +
            `${JSON.stringify({ ...response.data, data: { ...response.data.data, label_pdf: undefined } }).slice(0, 500)}`
        )

        return failed('the courier accepted the request but returned no waybill number')
      }

      // A parcel exists from here on, so nothing below may become `failed`.
      // No price: the create response carries none, and the label is fetched
      // later through `labelPdf()` rather than stored.
      const waybill: Waybill = { number, trackingUrl: pigeonTrackingUrl(number) }

      return { status: 'ok', data: waybill }
    },

    async trackShipments(numbers): Promise<LookupResult<TrackingReport>> {
      const credentials = config.credentials?.() ?? null
      if (!credentials) return unconfigured()

      const wanted = [...new Set(numbers.map((number) => number.trim()).filter(Boolean))]
      if (wanted.length === 0) return { status: 'ok', data: { found: [], missing: [] } }

      const batches: string[][] = []
      for (let i = 0; i < wanted.length; i += TRACK_BATCH) {
        batches.push(wanted.slice(i, i + TRACK_BATCH))
      }

      const [paid, ...answers] = await Promise.all([
        payouts(credentials),
        ...batches.map((references) =>
          call<PigeonBulkTracking>(credentials, {
            method: 'POST',
            path: '/shipments/track/bulk',
            body: { references },
          })
        ),
      ])

      const report: TrackingReport = { found: [], missing: [] }

      for (const [index, answer] of answers.entries()) {
        if (!answer.ok) return failed(answer.reason)

        for (const number of batches[index]) {
          const raw = answer.data.data?.[number]

          if (!raw || raw.found === false) {
            report.missing.push({
              number,
              reason: raw?.error?.trim() || 'Pigeon Express does not know this number',
            })
            continue
          }

          report.found.push(toTracking(number, raw, paid.get(number)))
        }
      }

      return { status: 'ok', data: report }
    },

    async labelPdf(number) {
      const credentials = config.credentials?.() ?? null
      if (!credentials) return unconfigured()

      try {
        const response = await fetch(
          `${config.baseUrl}/shipments/${encodeURIComponent(number)}/label?format=a4`,
          {
            headers: { ...headersFor(credentials), Accept: 'application/pdf' },
            signal: AbortSignal.timeout(LABEL_TIMEOUT_MS),
            cache: 'no-store',
          }
        )

        if (!response.ok) return failed(`HTTP ${response.status}`)

        const bytes = await response.arrayBuffer()
        const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, PDF_SIGNATURE.length))

        if (String.fromCharCode(...head) !== PDF_SIGNATURE) {
          return failed(`${bytes.byteLength} bytes that are not a PDF`)
        }

        return { status: 'ok', data: bytes }
      } catch (error) {
        return failed(error instanceof Error ? error.message : 'unknown error')
      }
    },
  }
}
