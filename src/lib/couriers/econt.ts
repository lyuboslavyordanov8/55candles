import 'server-only'

import type { Courier } from '../shipping'
import { postJson } from './http'
import type { CourierCity, CourierClient, CourierOffice, LookupResult } from './types'

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
 * ## Why this sends no credentials
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
 * things that cost money. That is a separate call site and will carry its own.
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

export interface EcontConfig {
  baseUrl: string
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
  }
}
