import type { Money } from '../money'
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

/**
 * Where a parcel is going, in the form both couriers address one.
 *
 * Shared by the quote and the waybill so that the price a customer was shown and
 * the label eventually printed are built from the same fields — a parcel quoted
 * to an office and booked to an address would be a different price, silently.
 */
export interface ParcelDestination {
  method: DeliveryMethod
  /** The office code for `office`/`locker` — a `CourierOffice.id`. */
  officeId?: string
  /**
   * Destination for `door`. `street` is whatever the customer typed, passed
   * through as the courier's `fullAddress`: Bulgarian addresses are written many
   * valid ways and the courier's own parser handles them (`ж.к. Младост, бл. 5,
   * вх. А` prices fine). `city` and `postCode` are both required — a post code
   * alone is ambiguous, and Econt refuses it with "повече от едно населени места".
   */
  address?: { city: string; postCode: string; street: string }
}

/**
 * A parcel to be priced.
 *
 * Deliberately carries **no personal data**: no name, no phone, no house number.
 * A price depends on the destination settlement, the weight and the amount to
 * collect, and nothing else — verified against Econt on 2026-09-20, where a
 * quote with no `receiverClient` at all returns the same figure as one with it.
 * So the customer's details are sent to the courier when a waybill is created
 * and there is a parcel to deliver, not while they are still deciding.
 */
export interface ShipmentQuoteRequest extends ParcelDestination {
  weightGrams: number
  /**
   * What the courier will collect on delivery (наложен платеж), so that its COD
   * fee comes back as part of the answer. `null` for no collection.
   */
  codAmount: Money | null
}

/**
 * A parcel to actually book.
 *
 * The quote's fields plus the two things a courier cannot deliver without: who
 * to hand it to and what number to ring. This is the moment the customer's
 * details leave the shop, which is why they appear on this type and not on
 * `ShipmentQuoteRequest`.
 */
export interface WaybillRequest extends ParcelDestination {
  weightGrams: number
  /** What the courier collects on delivery. `null` on a prepaid parcel. */
  codAmount: Money | null
  recipient: {
    name: string
    /** Required by every courier: a parcel with no phone is a parcel nobody can deliver. */
    phone: string
    /** Passed on only when the customer gave one, for the courier's own notification. */
    email?: string
  }
  /**
   * Our order number, printed on the label and carried in the courier's own
   * record, so a parcel found on a shelf can be traced back to an order.
   */
  orderNumber: string
  /**
   * What was sold, line by line, adding up to `codAmount` exactly. Present on a
   * наложен платеж parcel only, and read only by a courier that issues the
   * fiscal receipt on the shop's behalf (Speedy under its Н-18 annex). See
   * `receiptLinesFor()` in `src/lib/waybills.ts`.
   */
  receipt?: readonly ReceiptLine[]
}

/** One line of the касов бон a courier issues for us. */
export interface ReceiptLine {
  description: string
  /** With VAT, if there is any. Always positive. */
  amount: Money
}

/**
 * A booked parcel.
 *
 * `number` is the only field that must exist: once the courier has issued one,
 * the parcel is real and billable, so everything else is best-effort detail
 * rather than a reason to report failure. See `createWaybill`.
 */
export interface Waybill {
  /** The waybill (товарителница) number, as printed and tracked. */
  number: string
  /** Public tracking page for this parcel, ready to send to the customer. */
  trackingUrl: string
  /** The courier's own printable label, when the response carries one. */
  pdfUrl?: string
  /** What the courier says this parcel costs, when the response is readable. */
  price?: ShipmentRate
  /** ISO date the courier expects to deliver on, when it commits to one. */
  expectedDeliveryDate?: string
}

/**
 * What a courier will charge for one parcel.
 *
 * Split, not a single number, because the two halves are *ours* to allocate
 * differently: the delivery charge is passed to the customer and the COD fee is
 * absorbed by the merchant (`COD_FEE_PAID_BY`). A lump sum would force one
 * policy on both.
 */
export interface ShipmentRate {
  /** Carrying the parcel: the courier service plus any surcharge on it. */
  delivery: Money
  /** The courier's fee for collecting наложен платеж. Zero when none applies. */
  codFee: Money
  /** Everything the courier reported for this parcel. `delivery + codFee`. */
  total: Money
  /**
   * The courier's own wording for the service it priced — e.g. "Куриерска услуга
   * - между офисите на куриера до 1 кг". Kept for the order record and the log:
   * it is the evidence of *which* tariff line produced this number.
   */
  description?: string
}

/** One scan in a parcel's history, as the courier words it. */
export interface TrackingEvent {
  /** ISO timestamp. */
  at: string
  /** What happened and where, e.g. "София НЛЦ Искър" or "при куриер Диана Христова". */
  text: string
}

/**
 * Where one parcel is, read live from the courier.
 *
 * `status` is the courier's own short wording ("Доставена", "Приета в офис") and
 * is shown as it comes rather than mapped onto `OrderStatus`: the courier has
 * states we do not (a second delivery attempt, storage in an office), and a
 * mapping would quietly decide which of them the admin gets to see.
 *
 * The money is the part the order statuses cannot see. `codCollected` is the
 * courier saying the customer paid; `codPaid` is the courier saying it sent the
 * money on to us. Neither is a bank receipt — `reconciled` still means someone
 * saw it arrive.
 */
export interface ShipmentTracking {
  number: string
  status: string
  /** Newest first. */
  events: TrackingEvent[]
  /** ISO timestamp of the hand-over to the customer, once there is one. */
  deliveredAt?: string
  expectedDeliveryDate?: string
  codCollected?: { amount: Money; at: string }
  codPaid?: { amount: Money; at: string }
  /** The waybill this one turned into — a return to sender, most often. */
  followedBy?: string
}

/** A waybill the courier could not report on, with its reason. */
export interface TrackingMiss {
  number: string
  reason: string
}

export interface TrackingReport {
  found: ShipmentTracking[]
  missing: TrackingMiss[]
}

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

  /**
   * What this parcel actually costs, from the courier's own tariff.
   *
   * `unconfigured` means the courier cannot price anything yet — no contract
   * credentials, or no hand-over point configured — and the caller falls back to
   * the static card. `failed` means we asked and did not get an answer we can
   * trust, which is *not* a licence to invent a number: see
   * `src/lib/shipping-rates.ts`.
   */
  priceShipment(request: ShipmentQuoteRequest): Promise<LookupResult<ShipmentRate>>

  /**
   * Book the parcel: this **creates a real waybill** the shop will be billed for.
   *
   * The one call in this contract with a side effect at the courier, which sets
   * two rules for every implementation:
   *
   * - **Never `failed` once a number exists.** If the courier issued a waybill
   *   and something later in the response could not be read, report `ok` with
   *   what is known. A `failed` result invites the caller to try again, and a
   *   retry here means a second parcel, a second charge, and a label the shop
   *   has to find and cancel.
   * - **Idempotency is the caller's.** No courier API we use offers it, so
   *   `src/lib/waybills.ts` holds the guard: an order that already has a number
   *   is never booked twice.
   */
  createWaybill(request: WaybillRequest): Promise<LookupResult<Waybill>>

  /**
   * Live status of parcels already booked, in one round trip.
   *
   * Read-only, so a failure is harmless and nothing is retried hard: the admin
   * page shows "no answer" and the next load asks again. A number the courier
   * does not know lands in `missing` rather than failing the whole batch.
   */
  trackShipments(numbers: readonly string[]): Promise<LookupResult<TrackingReport>>

  /**
   * The label PDF for a booked parcel, for a courier that serves it only
   * behind its API keys — Pigeon Express. Econt hands back a link at booking
   * time instead (`Waybill.pdfUrl`), so it has no need of this.
   */
  labelPdf?(number: string): Promise<LookupResult<ArrayBuffer>>
}
