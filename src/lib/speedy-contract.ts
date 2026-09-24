import type { OrderStatus } from '@/db/schema'
import { periodOf, recentPeriods } from './accounting/period-key'

/**
 * Keeping to contract №515803 with Speedy, on the terms that depend on us.
 *
 * Pure: the parcels come in, the checks come out, and the page and the tests
 * both call the same function. The loader is `speedy-contract-data.ts`.
 *
 * Only the clauses the shop can breach are here. The prices are not — they are
 * confidential under Прил. 4 т.10 and nothing below needs them, because every
 * figure is read off what Speedy itself quoted at booking (`courierPrice` in
 * the booking event).
 *
 * Several terms were clarified by Speedy (Силвия Колева) by email on
 * 2026-09-24 rather than by annex, and say so in `source`: an email is evidence,
 * not a clause, and the page must not present it as one.
 */

export const SPEEDY_CONTRACT = {
  number: '515803',
  signedOn: '2026-09-24',
  /**
   * т. 7.1: the contract ends on its own below this monthly turnover, excl. ДДС.
   * Applies from the second contract year — Speedy, by email. Months with no
   * parcels at all are not counted, because the account is marked seasonal.
   */
  minMonthlyTurnoverMinor: 5113,
  turnoverRuleFrom: '2027-09-24',
  /** т. 7.1: no parcels for this long ends it — but see `seasonal`. */
  inactivityMonths: 6,
  /** Speedy, by email: the account is marked as a seasonal business. */
  seasonal: true,
  /**
   * т. 8: preferential prices last 12 months. Renewed, by email, on more than
   * 20 parcels — per month or over the year was not said, so both are shown.
   */
  preferentialUntil: '2027-09-24',
  renewalParcels: 20,
  /** Raised with usage without interrupting the service — Speedy, by email. */
  creditLimitMinor: 20000,
} as const

/** Speedy's own ДДС on its services, to take the contract's "без ДДС" figure out of a quote. */
const SPEEDY_VAT_RATE = 0.2

/** One Speedy waybill the shop booked. */
export interface SpeedyParcel {
  bookedAt: Date
  /** What Speedy quoted at booking, ДДС included. `null` when the answer had none. */
  priceMinor: number | null
  status: OrderStatus
}

export interface SpeedyMonth {
  period: string
  parcels: number
  delivered: number
  /** Excl. ДДС, from the parcels that have a price. */
  turnoverMinor: number
  /** Parcels with no recorded price, so `turnoverMinor` understates the month. */
  unpriced: number
  state: 'ok' | 'under' | 'idle' | 'not_yet'
}

export type CheckTone = 'success' | 'info' | 'warning' | 'danger'

export interface ContractCheck {
  key: 'turnover' | 'inactivity' | 'renewal' | 'credit' | 'receipt' | 'live'
  title: string
  tone: CheckTone
  text: string
  source: string
}

export interface SpeedyContractReport {
  months: SpeedyMonth[]
  checks: ContractCheck[]
  /** The worst tone among the checks — what a banner elsewhere keys off. */
  worst: CheckTone
}

const DELIVERED: readonly OrderStatus[] = [
  'delivered',
  'cod_collected',
  'reconciled',
  'refunded',
  'partially_refunded',
]

const DAY = 24 * 60 * 60 * 1000

/** A contract date as the instant it starts in Sofia — near enough for day counts. */
function dateOf(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+03:00`)
}

export function netOfVat(grossMinor: number): number {
  return Math.round(grossMinor / (1 + SPEEDY_VAT_RATE))
}

function euro(minor: number): string {
  return `${(minor / 100).toFixed(2).replace('.', ',')} €`
}

const RANK: Record<CheckTone, number> = { success: 0, info: 1, warning: 2, danger: 3 }

export function speedyContractReport(input: {
  parcels: readonly SpeedyParcel[]
  now: Date
  /** `SPEEDY_COD_FISCAL_RECEIPT` is on. */
  fiscalReceiptOn: boolean
  /** Customers can choose Speedy at checkout. */
  live: boolean
}): SpeedyContractReport {
  const { parcels, now, fiscalReceiptOn, live } = input
  const terms = SPEEDY_CONTRACT
  const ruleFrom = dateOf(terms.turnoverRuleFrom)
  const ruleApplies = now >= ruleFrom

  const months: SpeedyMonth[] = recentPeriods(12, now).map((period) => {
    const inMonth = parcels.filter((parcel) => periodOf(parcel.bookedAt) === period)
    const priced = inMonth.filter((parcel) => parcel.priceMinor !== null)
    const turnoverMinor = priced.reduce((sum, parcel) => sum + netOfVat(parcel.priceMinor!), 0)
    const monthApplies = period >= periodOf(ruleFrom)

    return {
      period,
      parcels: inMonth.length,
      delivered: inMonth.filter((parcel) => DELIVERED.includes(parcel.status)).length,
      turnoverMinor,
      unpriced: inMonth.length - priced.length,
      state:
        inMonth.length === 0
          ? 'idle'
          : turnoverMinor >= terms.minMonthlyTurnoverMinor
            ? 'ok'
            : monthApplies
              ? 'under'
              : 'not_yet',
    }
  })

  const checks: ContractCheck[] = []

  if (!live) {
    checks.push({
      key: 'live',
      title: 'Speedy в магазина',
      tone: 'info',
      text: 'Speedy още не се предлага на клиентите, така че тук няма пратки. Броят се само товарителниците, издадени от админа. Ръчно създадените в MySpeedy не се виждат.',
      source: 'BOOKABLE_COURIERS в src/lib/shipping.ts',
    })
  }

  checks.push(turnoverCheck(months[0], months[1], ruleApplies, now))
  checks.push(inactivityCheck(parcels, now))
  checks.push(renewalCheck(parcels, months, now))
  checks.push(creditCheck(parcels, now))
  checks.push(receiptCheck(fiscalReceiptOn, live))

  const worst = checks.reduce<CheckTone>(
    (worst, check) => (RANK[check.tone] > RANK[worst] ? check.tone : worst),
    'success'
  )

  return { months, checks, worst }
}

/**
 * The checks worth interrupting the order list for.
 *
 * Every `danger`, and every `warning` but the receipt's: before Speedy is live
 * that one is a to-do, not an alarm, and once it is live an unset receipt is
 * `danger` anyway. A banner that is always there is a banner nobody reads.
 */
export function bannerChecks(report: SpeedyContractReport): ContractCheck[] {
  return report.checks.filter(
    (check) => check.tone === 'danger' || (check.tone === 'warning' && check.key !== 'receipt')
  )
}

function turnoverCheck(
  current: SpeedyMonth,
  previous: SpeedyMonth,
  ruleApplies: boolean,
  now: Date
): ContractCheck {
  const min = SPEEDY_CONTRACT.minMonthlyTurnoverMinor
  const base = {
    key: 'turnover' as const,
    title: 'Минимален месечен оборот',
    source: 'т. 7.1; от втората година и без месеците без пратки, по имейл от Speedy',
  }
  const figure = `Този месец: ${euro(current.turnoverMinor)} от ${euro(min)} без ДДС, ${current.parcels} пратки.`
  const unpriced = current.unpriced
    ? ` ${current.unpriced} пратки нямат записана цена, затова реалният оборот е по-висок.`
    : ''

  if (!ruleApplies) {
    return {
      ...base,
      tone: 'info',
      text: `Важи от ${formatDate(SPEEDY_CONTRACT.turnoverRuleFrom)}. ${figure}${unpriced}`,
    }
  }

  if (previous.state === 'under') {
    return {
      ...base,
      tone: 'danger',
      text: `Миналият месец беше под минимума: ${euro(previous.turnoverMinor)} от ${euro(min)}. По т. 7.1 договорът може да бъде прекратен. Свържете се със Speedy. ${figure}${unpriced}`,
    }
  }

  if (current.parcels === 0 || current.turnoverMinor >= min) {
    return {
      ...base,
      tone: current.parcels === 0 ? 'info' : 'success',
      text:
        current.parcels === 0
          ? `Този месец още няма пратки. Месец без пратки не се брои, защото сте отбелязани като сезонен бизнес.${unpriced}`
          : `${figure}${unpriced}`,
    }
  }

  // From the priced parcels only: an unpriced one would drag the average to zero.
  const priced = current.parcels - current.unpriced
  const perParcel = priced > 0 ? current.turnoverMinor / priced : 0
  const estimate =
    perParcel > 0
      ? ` До края на ${monthName(now)} трябват още около ${Math.ceil((min - current.turnoverMinor) / perParcel)} пратки. Иначе месецът ще е под минимума.`
      : ''

  return {
    ...base,
    tone: 'warning',
    text: `${figure}${estimate} Месец без нито една пратка не се брои, но месец с малко пратки се брои.${unpriced}`,
  }
}

function inactivityCheck(parcels: readonly SpeedyParcel[], now: Date): ContractCheck {
  const base = {
    key: 'inactivity' as const,
    title: 'Период без пратки',
    source: 'т. 7.1; сезонният бизнес е потвърден по имейл, не с анекс',
  }
  const last = parcels.reduce<Date | null>(
    (latest, parcel) => (!latest || parcel.bookedAt > latest ? parcel.bookedAt : latest),
    null
  )

  if (!last) return { ...base, tone: 'info', text: 'Все още няма пратки със Speedy.' }

  const days = Math.floor((now.getTime() - last.getTime()) / DAY)
  const limitDays = SPEEDY_CONTRACT.inactivityMonths * 30

  return {
    ...base,
    tone: days >= limitDays - 30 ? 'warning' : 'success',
    text:
      days >= limitDays - 30
        ? `Последната пратка е преди ${days} дни. По договор срокът е ${SPEEDY_CONTRACT.inactivityMonths} месеца. Speedy казва, че при сезонен бизнес месеците без пратки не се броят, но това е имейл, не анекс. Една пратка нулира срока.`
        : `Последната пратка е преди ${days} дни.`,
  }
}

function renewalCheck(
  parcels: readonly SpeedyParcel[],
  months: readonly SpeedyMonth[],
  now: Date
): ContractCheck {
  const start = dateOf(SPEEDY_CONTRACT.signedOn)
  const end = dateOf(SPEEDY_CONTRACT.preferentialUntil)
  const needed = SPEEDY_CONTRACT.renewalParcels
  const inYear = parcels.filter((parcel) => parcel.bookedAt >= start && parcel.bookedAt < end).length
  const bestMonth = months.reduce((best, month) => Math.max(best, month.parcels), 0)
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY)
  const base = {
    key: 'renewal' as const,
    title: 'Подновяване на преференциалните цени',
    source: 'т. 8; прагът от 20 пратки е по имейл от Speedy, периодът му още не е уточнен',
  }
  const figure = `${inYear} пратки от ${formatDate(SPEEDY_CONTRACT.signedOn)} насам, най-много ${bestMonth} за един месец.`

  if (daysLeft <= 0) {
    return {
      ...base,
      tone: 'warning',
      text: `Преференциалните цени изтекоха на ${formatDate(SPEEDY_CONTRACT.preferentialUntil)}. Проверете със Speedy по коя тарифа сте. ${figure}`,
    }
  }

  const enough = inYear > needed

  return {
    ...base,
    tone: enough ? 'success' : daysLeft <= 90 ? 'warning' : 'info',
    text: `Изтичат след ${daysLeft} дни (${formatDate(SPEEDY_CONTRACT.preferentialUntil)}). Подновяват се при над ${needed} пратки. ${figure}${
      enough ? '' : ' Ако прагът се окаже месечен, трябва месец с над 20 пратки.'
    }`,
  }
}

function creditCheck(parcels: readonly SpeedyParcel[], now: Date): ContractCheck {
  const period = periodOf(now)
  const fees = parcels
    .filter((parcel) => periodOf(parcel.bookedAt) === period)
    .reduce((sum, parcel) => sum + (parcel.priceMinor ?? 0), 0)
  const limit = SPEEDY_CONTRACT.creditLimitMinor

  return {
    key: 'credit',
    title: 'Кредитен лимит',
    tone: fees >= limit * 0.8 ? 'warning' : 'info',
    text: `Такси този месец: ${euro(fees)} с ДДС. Лимитът е ${euro(limit)}. ${
      fees >= limit * 0.8
        ? 'Приближавате лимита. Speedy казва, че го вдига според оборота, но го предупредете преди пика.'
        : 'Speedy казва, че лимитът се вдига според оборота, без да спира услугата.'
    }`,
    source: 'договорът; вдигането според оборота е по имейл от Speedy',
  }
}

function receiptCheck(fiscalReceiptOn: boolean, live: boolean): ContractCheck {
  const base = {
    key: 'receipt' as const,
    title: 'Касов бон при наложен платеж',
    source: 'анекс по Наредба Н-18 към договора',
  }

  if (fiscalReceiptOn) {
    return {
      ...base,
      tone: 'success',
      text: 'Включен. Speedy издава бона от името на фирмата за всяка пратка с наложен платеж.',
    }
  }

  return {
    ...base,
    tone: live ? 'danger' : 'warning',
    text: live
      ? 'Изключен, а Speedy е пуснат. Пратките с наложен платеж излизат без касов бон. Включете SPEEDY_COD_FISCAL_RECEIPT във Vercel.'
      : 'Изключен. Включете SPEEDY_COD_FISCAL_RECEIPT във Vercel, преди Speedy да се пусне на клиентите. Преди това трябва потвърждение от api.support@speedy.bg и от счетоводителя.',
  }
}

const dateFormat = new Intl.DateTimeFormat('bg-BG', { dateStyle: 'long', timeZone: 'Europe/Sofia' })

function formatDate(isoDate: string): string {
  return dateFormat.format(dateOf(isoDate))
}

const monthFormat = new Intl.DateTimeFormat('bg-BG', { month: 'long', timeZone: 'Europe/Sofia' })

function monthName(at: Date): string {
  return monthFormat.format(at)
}
