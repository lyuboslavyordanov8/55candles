import { money, type Money } from './money'

/**
 * Couriers and delivery methods (AUDIT.md Q-22, Q-24, Q-25).
 *
 * The owner offers all three methods on both couriers. The *rates* are unset:
 * they come from a signed merchant contract, and a guessed rate is a loss on
 * every parcel. `quote()` therefore returns a discriminated result — an
 * unconfigured tariff is a first-class outcome the UI must render, not an
 * exception or a zero.
 *
 * No courier API is called from this module. Address/office lookup is a
 * network concern and lives in `src/lib/couriers/`; this file is pure
 * arithmetic so it is trivially testable and can run anywhere.
 */

export const COURIERS = ['econt', 'speedy'] as const
export type Courier = (typeof COURIERS)[number]

/**
 * `door` — to the customer's address.
 * `office` — collected from a courier branch.
 * `locker` — automated parcel station (Econt автомат / Speedy locker).
 *
 * Locker has hard size limits, and whether a boxed candle fits is a physical
 * question about your packaging — see `LOCKER_MAX_GRAMS` below.
 */
export const DELIVERY_METHODS = ['door', 'office', 'locker'] as const
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number]

export interface DeliveryOption {
  courier: Courier
  method: DeliveryMethod
}

/**
 * A weight band. `upToGrams` is inclusive; `null` means "and above".
 * Bands must be authored in ascending order — `assertValidTariff` enforces it,
 * because an out-of-order band silently makes a heavier parcel cheaper.
 */
export interface WeightBand {
  upToGrams: number | null
  price: Money
}

export interface Tariff {
  bands: WeightBand[]
  /**
   * Fee the *courier* charges for collecting наложен платеж, if any.
   * Who bears it is a separate decision — see `COD_FEE_PAID_BY` (Q-23).
   */
  codFee?: Money
}

/**
 * Rate cards, keyed `${courier}:${method}` (AUDIT.md Q-22).
 *
 * **Deliberately empty.** Fill a key with bands from your merchant contract:
 *
 * ```ts
 * 'econt:office': {
 *   bands: [
 *     { upToGrams: 1000, price: eur(3.5) },
 *     { upToGrams: 2000, price: eur(4.2) },
 *     { upToGrams: null, price: eur(6.0) },
 *   ],
 *   codFee: eur(0.6),
 * },
 * ```
 */
export const tariffs: Partial<Record<string, Tariff>> = {
  // [TODO: Q-22 — rate cards from the Econt and Speedy merchant contracts.]
}

export function tariffKey(option: DeliveryOption): string {
  return `${option.courier}:${option.method}`
}

/**
 * Free-delivery threshold (Q-24), or `null` for none.
 *
 * `null` is not "no threshold decided" — it is "no free delivery", the safe
 * default, since a threshold that is accidentally zero ships everything free.
 */
export const FREE_DELIVERY_OVER: Money | null = null

/**
 * Practical upper bound for a parcel locker. Bulgarian lockers are constrained
 * by compartment volume rather than weight, but weight is the only dimension
 * this model has until packed dimensions exist (Q-12), so it stands in as a
 * conservative proxy.
 */
export const LOCKER_MAX_GRAMS = 20_000

/** Packaging added to the summed product weight: box, filler, tape. */
export const PACKAGING_WEIGHT_GRAMS = 150

export type ShippingQuote =
  | { status: 'quoted'; price: Money; free: boolean }
  | { status: 'unconfigured'; reason: 'noTariff' }
  | { status: 'unavailable'; reason: 'tooHeavyForLocker' | 'noBandForWeight' }

export class TariffError extends Error {}

/**
 * Validate a rate card. Called by `quote()` and by the test suite, so a
 * malformed card fails loudly at the point of use rather than producing a
 * plausible-looking wrong number.
 */
export function assertValidTariff(key: string, tariff: Tariff): void {
  if (tariff.bands.length === 0) {
    throw new TariffError(`${key}: tariff has no weight bands`)
  }

  let previous = 0

  for (const [index, band] of tariff.bands.entries()) {
    const isLast = index === tariff.bands.length - 1

    if (band.upToGrams === null) {
      if (!isLast) {
        throw new TariffError(`${key}: open-ended band must be last`)
      }
      continue
    }

    if (band.upToGrams <= previous) {
      throw new TariffError(
        `${key}: bands must ascend — ${band.upToGrams}g follows ${previous}g`
      )
    }

    previous = band.upToGrams
  }
}

/** Total billable weight for a set of item weights. */
export function billableWeight(itemWeightsGrams: readonly number[]): number {
  const items = itemWeightsGrams.reduce((total, grams) => total + grams, 0)

  // An empty basket has no parcel, so no packaging.
  return items === 0 ? 0 : items + PACKAGING_WEIGHT_GRAMS
}

/**
 * Price a delivery.
 *
 * `orderTotal` is the goods total, used only for the free-delivery threshold.
 * The threshold is applied to goods, not to goods-plus-shipping, which would
 * be circular.
 */
export function quote(
  option: DeliveryOption,
  weightGrams: number,
  orderTotal: Money
): ShippingQuote {
  if (option.method === 'locker' && weightGrams > LOCKER_MAX_GRAMS) {
    return { status: 'unavailable', reason: 'tooHeavyForLocker' }
  }

  const key = tariffKey(option)
  const tariff = tariffs[key]

  if (!tariff) {
    return { status: 'unconfigured', reason: 'noTariff' }
  }

  assertValidTariff(key, tariff)

  const band = tariff.bands.find(
    (candidate) => candidate.upToGrams === null || weightGrams <= candidate.upToGrams
  )

  if (!band) {
    // Only reachable when the last band is closed and the parcel exceeds it.
    return { status: 'unavailable', reason: 'noBandForWeight' }
  }

  if (FREE_DELIVERY_OVER && orderTotal.amountMinor >= FREE_DELIVERY_OVER.amountMinor) {
    return { status: 'quoted', price: money(0, orderTotal.currency), free: true }
  }

  return { status: 'quoted', price: band.price, free: false }
}

/**
 * Who pays the наложен платеж fee (Q-23).
 *
 * `'merchant'` is the safe default: showing the customer a fee that turns out
 * not to apply is a smaller error than adding one they never agreed to. Either
 * way it must appear as its own line before they confirm — see `codFeeFor`.
 */
export const COD_FEE_PAID_BY: 'merchant' | 'customer' = 'merchant'

/** COD fee to add to the customer's total, or `null` if they do not pay it. */
export function codFeeFor(option: DeliveryOption): Money | null {
  if (COD_FEE_PAID_BY === 'merchant') return null

  return tariffs[tariffKey(option)]?.codFee ?? null
}

/** Every courier/method pair, for rendering the picker. */
export function allDeliveryOptions(): DeliveryOption[] {
  return COURIERS.flatMap((courier) =>
    DELIVERY_METHODS.map((method) => ({ courier, method }))
  )
}

/** Delivery options with a usable rate card, for the launch checklist. */
export function configuredDeliveryOptions(): DeliveryOption[] {
  return allDeliveryOptions().filter((option) => tariffs[tariffKey(option)])
}

export const isShippingConfigured = () => configuredDeliveryOptions().length > 0
