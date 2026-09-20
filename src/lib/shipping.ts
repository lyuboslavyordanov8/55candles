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
 * The couriers an order may actually be placed with (AUDIT.md Q-22).
 *
 * Econt only, by decision: Speedy needs a signed contract and credentials
 * issued by hand before its API answers anything, so a parcel chosen for it
 * could not be labelled. It stays in `COURIERS` — the type, the database enum
 * and the tariff table all keep a place for it, and the checkout shows it as
 * coming soon rather than pretending it was never planned.
 *
 * Client-safe on purpose, so the form can grey the option out and the server can
 * refuse it from the same list. It is a commercial fact, not a credential: see
 * `couriersWithOfficeLookup()` in `src/lib/couriers/` for the separate question
 * of whose office list can be searched.
 */
export const BOOKABLE_COURIERS: readonly Courier[] = ['econt']

export function isCourierBookable(courier: Courier): boolean {
  return BOOKABLE_COURIERS.includes(courier)
}

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
   *
   * A flat amount, which Econt's real fee is not: measured against the live
   * account on 2026-09-20 it is 3.24% of the collected sum with no cap and no
   * floor worth naming — 0.65 EUR on a 19.99 order, 3.24 on a 100. This field
   * cannot express that, and deliberately is not being taught to: the live quote
   * returns the courier's own figure per parcel (`ShipmentRate.codFee`), so the
   * only thing a percentage here would buy is a second, competing model of a fee
   * nobody is charged while `COD_FEE_PAID_BY` is `'merchant'`.
   */
  codFee?: Money
}

/**
 * True while any rate below is a placeholder rather than a contracted rate.
 *
 * The checkout says so visibly while this is set, and a test fails if you clear
 * it while `PLACEHOLDER_BANDS` is still referenced — the same guard pattern as
 * `LEGAL_IS_DRAFT`. Clear it when the real cards are in.
 *
 * The table is no longer the main way an order is priced: with credentials and a
 * hand-over point configured, the courier quotes each parcel itself
 * (`src/lib/shipping-rates.ts`) and nothing below is read. It remains the answer
 * to "what happens with nothing configured at all", which is what a fresh clone
 * is, and the checkout's notice is shown only while that is the live path.
 */
export const TARIFFS_ARE_PLACEHOLDER = true

/**
 * Stand-in rate card (AUDIT.md Q-22 — **not** from a merchant contract).
 *
 * Added 2026-08-06 so the owner can exercise the order flow: with no tariff at
 * all, `quote()` correctly returns `unconfigured` and checkout never reaches a
 * total, so there is nothing to test. These numbers are roughly the shape of
 * Bulgarian courier list pricing for a sub-2 kg parcel, which makes the band
 * selection realistic — they are **not** your rates, and a contracted rate is
 * usually well below list.
 *
 * Every method shares this card, which is also wrong: office and locker are
 * normally cheaper than to-the-door. Real cards differ per courier and method,
 * which is exactly why `tariffs` is keyed that way.
 */
const PLACEHOLDER_BANDS: WeightBand[] = [
  { upToGrams: 1000, price: money(499) },
  { upToGrams: 2000, price: money(599) },
  { upToGrams: 5000, price: money(799) },
  { upToGrams: null, price: money(1199) },
]

/**
 * Rate cards, keyed `${courier}:${method}` (AUDIT.md Q-22).
 *
 * Replace each entry with bands from your merchant contract, then clear
 * `TARIFFS_ARE_PLACEHOLDER`:
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
  // [TODO: Q-22 — replace with the real Econt and Speedy rate cards.]
  'econt:door': { bands: PLACEHOLDER_BANDS, codFee: money(60) },
  'econt:office': { bands: PLACEHOLDER_BANDS, codFee: money(60) },
  'econt:locker': { bands: PLACEHOLDER_BANDS, codFee: money(60) },
  'speedy:door': { bands: PLACEHOLDER_BANDS, codFee: money(60) },
  'speedy:office': { bands: PLACEHOLDER_BANDS, codFee: money(60) },
  'speedy:locker': { bands: PLACEHOLDER_BANDS, codFee: money(60) },
}

export function tariffKey(option: DeliveryOption): string {
  return `${option.courier}:${option.method}`
}

/**
 * Free delivery from this many candles (Q-24), or `null` for none.
 *
 * Answered by the owner on 2026-09-20: **three candles or more and the shop pays
 * the carriage.** Counted in candles rather than in money because that is how the
 * promise was made and how it is advertised — "three candles, free delivery" is a
 * sentence a customer can check against their own basket without arithmetic.
 *
 * It is a promotion, not a courier rate: Econt still charges its 4,03 EUR and the
 * shop absorbs it, which is why the quote keeps the amount it gave up in
 * `listPrice` rather than discarding it. See `ShippingQuote`.
 */
export const FREE_DELIVERY_FROM_ITEMS: number | null = 3

/**
 * Free-delivery threshold by order value (Q-24), or `null` for none.
 *
 * `null` is not "no threshold decided" — it is "no free delivery *by value*",
 * which is the current decision: the promise is counted in candles, above. A
 * threshold that is accidentally zero ships everything free, so the safe default
 * stays.
 */
export const FREE_DELIVERY_OVER: Money | null = null

/**
 * The basket, as the free-delivery rules need to see it.
 *
 * Passed as one object rather than as two positional arguments so that adding the
 * candle count could not silently default to zero at a call site somebody forgot
 * to update — the compiler names every one of them.
 */
export interface BasketForDelivery {
  /**
   * Goods subtotal, *before* any promo discount. Judged before, on purpose: a
   * promo code must not be able to take a basket back under a free-delivery
   * threshold it had already earned, which is a charge appearing because the
   * customer saved money.
   */
  goods: Money
  /** Candles in the basket — the sum of the line quantities, not the lines. */
  itemCount: number
}

/**
 * Whether this basket ships free.
 *
 * Either threshold is enough; both are the shop's own promotions, so neither
 * depends on the courier answering.
 */
export function deliveryIsFree({ goods, itemCount }: BasketForDelivery): boolean {
  if (FREE_DELIVERY_FROM_ITEMS !== null && itemCount >= FREE_DELIVERY_FROM_ITEMS) {
    return true
  }

  if (FREE_DELIVERY_OVER && goods.amountMinor >= FREE_DELIVERY_OVER.amountMinor) {
    return true
  }

  return false
}

/**
 * How many more candles until the delivery is free, or `null` when there is
 * nothing to say — no candle threshold, an empty basket, or one that already
 * qualifies.
 *
 * For the nudge on the basket, which is the whole commercial point of the
 * threshold: a customer one candle short should be told so while they can still
 * act on it, not after they have paid for delivery.
 */
export function candlesUntilFreeDelivery(itemCount: number): number | null {
  if (FREE_DELIVERY_FROM_ITEMS === null || itemCount <= 0) return null
  if (itemCount >= FREE_DELIVERY_FROM_ITEMS) return null

  return FREE_DELIVERY_FROM_ITEMS - itemCount
}

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
  | {
      status: 'quoted'
      /** What the customer is charged. Zero when `free`. */
      price: Money
      free: boolean
      /**
       * What the carriage actually costs, whether or not the customer pays it.
       *
       * Equal to `price` on an ordinary order and to the amount the shop absorbed
       * on a free one. Kept rather than discarded because "free delivery" is a
       * cost the business carries, and a row of zeroes in the orders table is no
       * basis for deciding next month whether the promotion is affordable.
       */
      listPrice: Money
    }
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
 * `basket` is what the free-delivery rules are judged against — the candle count
 * and the goods subtotal. The thresholds apply to goods, not to
 * goods-plus-shipping, which would be circular.
 *
 * `courierPrice` is a rate the courier itself quoted for this exact parcel — see
 * `src/lib/shipping-rates.ts`. When it is supplied the table is not consulted at
 * all, but everything around it still is: the locker weight limit is a physical
 * fact about our packaging and the free-delivery threshold is our promotion, and
 * neither belongs to the courier. That is the whole reason a live rate comes in
 * as an argument rather than bypassing this function.
 *
 * A qualifying basket still needs a real price to exist before it can ship free.
 * Returning `quoted` at zero from an unpriceable parcel would hide the one thing
 * the shop needs to know about its own promotion — what it just cost — and would
 * mean a courier outage silently produced orders nobody had costed.
 */
export function quote(
  option: DeliveryOption,
  weightGrams: number,
  basket: BasketForDelivery,
  courierPrice?: Money
): ShippingQuote {
  if (option.method === 'locker' && weightGrams > LOCKER_MAX_GRAMS) {
    return { status: 'unavailable', reason: 'tooHeavyForLocker' }
  }

  let price: Money

  if (courierPrice) {
    price = courierPrice
  } else {
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

    price = band.price
  }

  if (deliveryIsFree(basket)) {
    return {
      status: 'quoted',
      price: money(0, basket.goods.currency),
      free: true,
      // What the shop is absorbing on this parcel.
      listPrice: price,
    }
  }

  return { status: 'quoted', price, free: false, listPrice: price }
}

/**
 * Who pays the наложен платеж fee (Q-23).
 *
 * `'merchant'` is the safe default: showing the customer a fee that turns out
 * not to apply is a smaller error than adding one they never agreed to. Either
 * way it must appear as its own line before they confirm — see `codFeeFor`.
 */
export const COD_FEE_PAID_BY: 'merchant' | 'customer' = 'merchant'

/**
 * COD fee to add to the customer's total, or `null` if they do not pay it.
 *
 * `courierFee` is the fee the courier quoted for this parcel — Econt's scales
 * with the amount collected, so a table constant can only ever approximate it.
 * Supplied, it wins; absent, the table stands in.
 */
export function codFeeFor(option: DeliveryOption, courierFee?: Money): Money | null {
  if (COD_FEE_PAID_BY === 'merchant') return null

  return courierFee ?? tariffs[tariffKey(option)]?.codFee ?? null
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
