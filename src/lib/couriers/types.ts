import type { Courier, DeliveryMethod } from '../shipping'

/**
 * Courier lookup contract (AUDIT.md Q-22, Q-25, B-13).
 *
 * Deliberately free of `server-only`, unlike the rest of this directory: the
 * office picker is a Client Component and needs these *types*. Type-only
 * imports are erased at compile time, so nothing ships to the browser — but
 * keeping the shapes in their own module means a client file can never reach
 * the credential-handling code by accident.
 *
 * The checkout never learns which courier it is talking to. Both Econt and
 * Speedy expose cities and offices, and both call a locker an unstaffed
 * office, so one contract covers them and the delivery form does not branch
 * per courier.
 */

export interface CourierCity {
  /** Courier's own city id, opaque to us. Only ever passed back to them. */
  id: string
  name: string
  /** Bulgarian post code, four digits. Used to prefill (and check) the form. */
  postCode: string
  /** Latin transliteration, where the courier supplies one. */
  nameEn?: string
}

/**
 * A collection point.
 *
 * `id` is the reference the *waybill* API expects, not the courier's internal
 * primary key — for Econt that is `office.code` (`receiverOfficeCode` in
 * `createLabel`), not `office.id`. Storing the wrong one produces an order that
 * looks fine until the label is printed and rejected.
 */
export interface CourierOffice {
  id: string
  courier: Courier
  /** `office` or `locker` — a locker is an unstaffed office in both APIs. */
  kind: Extract<DeliveryMethod, 'office' | 'locker'>
  name: string
  nameEn?: string
  address: string
  addressEn?: string
  cityId: string
  cityName: string
  cityNameEn?: string
  postCode: string
  /**
   * Opening hours as `HH:MM–HH:MM` in Europe/Sofia, when the courier reports
   * them. Absent rather than guessed: a wrong closing time sends someone to a
   * shut office.
   */
  hours?: string
}

/**
 * A lookup outcome.
 *
 * `unconfigured` and `failed` are separate on purpose. "No credentials yet" is
 * a permanent state the UI should explain and fall back from; "the courier
 * timed out" is transient and worth retrying. Collapsing them would make the
 * picker tell a customer the wrong story.
 */
export type LookupResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'unconfigured'; courier: Courier }
  | { status: 'failed'; courier: Courier; reason: string }

export interface CourierClient {
  readonly courier: Courier

  /** Cities with at least one collection point, matched on name or post code. */
  searchCities(query: string): Promise<LookupResult<CourierCity[]>>

  /** Collection points of one kind in a city. */
  officesIn(
    cityId: string,
    kind: CourierOffice['kind']
  ): Promise<LookupResult<CourierOffice[]>>

  /**
   * Resolve one office by the id we stored.
   *
   * Exists so the server can re-check a submitted office before it becomes an
   * order: offices close, and a customer may be working from a cached page.
   * `data: null` means "looked, and there is no such office" — distinct from a
   * `failed` lookup, which means we do not know.
   */
  findOffice(id: string): Promise<LookupResult<CourierOffice | null>>
}
