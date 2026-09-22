import { company } from '../company'

/**
 * Everything the accounting module knows about Bulgarian rules, in one file.
 *
 * The point of this module is that **no legal number, deadline or threshold
 * appears anywhere else in the codebase**. Legislation changes; when it does,
 * this file changes and nothing else has to be found and edited.
 *
 * ## What this module refuses to do
 *
 * It does not state legal figures as fact. Two kinds of number appear in
 * Bulgarian accounting and they are treated differently:
 *
 * - **The ДДС registration threshold has no default here.** It is a figure that
 *   has changed more than once, its applicable value depends on the year and on
 *   how turnover is measured, and a wrong one would either raise a false alarm
 *   or — far worse — stay quiet while the shop crossed it. So the monitor is
 *   *unconfigured* until somebody sets it, and the interface says so instead of
 *   guessing. `ЗДДС чл. 96` is the source to check; the accountant is who to ask.
 * - **Filing deadlines carry a conventional date and `verified: false`.** A
 *   calendar with no dates helps nobody, so the well-known ones are here — but
 *   every screen that shows them labels them as configuration to confirm, and
 *   `lastVerifiedOn` stays `null` until somebody does.
 *
 * Nothing in this module is advice, and the wording of everything it surfaces
 * says so. The shop organises and remembers; the accountant decides.
 */

// ---------------------------------------------------------------------------
// ДДС state
// ---------------------------------------------------------------------------

export interface VatState {
  registered: boolean
  number: string | null
}

/**
 * Whether the company charges ДДС. **One source, and it is not this file.**
 *
 * `company.isVatRegistered` already drives the storefront's price terms and the
 * basis printed on every invoice (`invoices.ts`). Reading it here rather than
 * declaring a second flag is the whole point: two places that both claim to know
 * the ДДС status is how a shop ends up charging tax on one screen and not on
 * another.
 *
 * Today: **not registered.** Becoming registered is an explicit edit to
 * `src/lib/company.ts` — deliberately a code change with a review, not a toggle
 * in a settings screen, because it changes what every price on the site means.
 */
export function vatState(): VatState {
  return {
    registered: company.isVatRegistered,
    number: company.vatNumber,
  }
}

// ---------------------------------------------------------------------------
// The registration-threshold monitor
// ---------------------------------------------------------------------------

/** Where the threshold figure comes from, when somebody has set one. */
const THRESHOLD_VAR = 'ACCOUNTING_VAT_THRESHOLD_EUR'

/** Where the monitor's rolling window comes from. Months, back from today. */
const WINDOW_VAR = 'ACCOUNTING_VAT_WINDOW_MONTHS'

/** The default window if none is configured: twelve months, the common reading. */
const DEFAULT_WINDOW_MONTHS = 12

export interface VatThresholdConfig {
  /** Minor units (cents), or `null` while nobody has configured a figure. */
  thresholdMinor: number | null
  /** How many months of turnover the monitor adds up. */
  windowMonths: number
  /** Fraction of the threshold at which the interface starts warning. */
  warnAt: number
  /** Fraction at which it stops being a nudge and becomes urgent. */
  urgentAt: number
  /** What to read if the figure needs checking. Never presented as the rule. */
  legalSource: string
}

export function vatThresholdConfig(): VatThresholdConfig {
  const configured = Number(process.env[THRESHOLD_VAR])
  const window = Number(process.env[WINDOW_VAR])

  return {
    thresholdMinor:
      Number.isFinite(configured) && configured > 0 ? Math.round(configured * 100) : null,
    windowMonths:
      Number.isInteger(window) && window > 0 && window <= 60 ? window : DEFAULT_WINDOW_MONTHS,
    warnAt: 0.8,
    urgentAt: 1,
    legalSource: 'ЗДДС чл. 96',
  }
}

export type VatMonitorLevel = 'unconfigured' | 'normal' | 'approaching' | 'exceeded'

export interface VatMonitor {
  level: VatMonitorLevel
  turnoverMinor: number
  thresholdMinor: number | null
  /** 0–1+, or `null` when there is no threshold to be a fraction of. */
  progress: number | null
  windowMonths: number
  legalSource: string
}

/**
 * Where the shop stands against the configured threshold.
 *
 * Reports a level and a number and stops there. It never says "register for
 * ДДС" — that is a decision with conditions this code does not model — and it
 * never says the threshold *was* crossed as a matter of law, only that the
 * turnover it can see has passed the figure it was given.
 */
export function vatMonitor(turnoverMinor: number): VatMonitor {
  const config = vatThresholdConfig()
  const base = {
    turnoverMinor,
    thresholdMinor: config.thresholdMinor,
    windowMonths: config.windowMonths,
    legalSource: config.legalSource,
  }

  if (config.thresholdMinor === null) {
    return { ...base, level: 'unconfigured', progress: null }
  }

  const progress = turnoverMinor / config.thresholdMinor

  return {
    ...base,
    progress,
    level:
      progress >= config.urgentAt ? 'exceeded' : progress >= config.warnAt ? 'approaching' : 'normal',
  }
}

// ---------------------------------------------------------------------------
// The compliance calendar
// ---------------------------------------------------------------------------

export type ComplianceCadence =
  /** Every month, on `dayOfMonth`. */
  | { kind: 'monthly'; dayOfMonth: number }
  /** Once a year, on `month` (1–12) and `dayOfMonth`. */
  | { kind: 'yearly'; month: number; dayOfMonth: number }

export interface ComplianceRule {
  /** Stable key. Referenced by notes and overrides; never shown to anyone. */
  key: string
  title: string
  description: string
  cadence: ComplianceCadence
  /** Days before the date at which the admin should start being told. */
  remindDaysBefore: readonly number[]
  /**
   * The act to read, when there is one. `null` for the shop's own routines,
   * which are not law and must not be dressed up as it.
   */
  legalSource: string | null
  /**
   * When a human last checked this against the current rules. `null` means
   * nobody has, and every screen that shows the rule says so.
   */
  lastVerifiedOn: string | null
  enabled: boolean
}

/**
 * The rules the calendar runs on.
 *
 * Two of these are the shop's own housekeeping and carry no `legalSource`: they
 * are what makes the month easy, not what the law demands. The rest name the act
 * and are unverified until the accountant confirms both the date and whether the
 * obligation applies to this company at all — a microenterprise with no
 * employees and no ДДС registration does not owe everything a bigger one does.
 */
export const COMPLIANCE_RULES: readonly ComplianceRule[] = [
  {
    key: 'monthly-package',
    title: 'Подготви документите за счетоводителя',
    description:
      'Затвори миналия месец: разходи, документи, банково извлечение, и изпрати пакета.',
    cadence: { kind: 'monthly', dayOfMonth: 5 },
    remindDaysBefore: [7, 3, 1],
    legalSource: null,
    lastVerifiedOn: null,
    enabled: true,
  },
  {
    key: 'monthly-expense-documents',
    title: 'Събери липсващите документи за разходи',
    description: 'Разход без документ не влиза в счетоводството — намери го, докато е свеж.',
    cadence: { kind: 'monthly', dayOfMonth: 1 },
    remindDaysBefore: [3],
    legalSource: null,
    lastVerifiedOn: null,
    enabled: true,
  },
  {
    key: 'annual-corporate-tax',
    title: 'Годишна данъчна декларация',
    description:
      'Декларацията по ЗКПО за миналата година. Срокът и дали се отнася за дружеството — потвърди със счетоводителя.',
    cadence: { kind: 'yearly', month: 6, dayOfMonth: 30 },
    remindDaysBefore: [30, 14, 7],
    legalSource: 'ЗКПО',
    lastVerifiedOn: null,
    enabled: true,
  },
  {
    key: 'annual-financial-statement',
    title: 'Публикуване на годишен финансов отчет',
    description:
      'Отчетът за миналата година се публикува в Търговския регистър. Срокът — потвърди със счетоводителя.',
    cadence: { kind: 'yearly', month: 9, dayOfMonth: 30 },
    remindDaysBefore: [30, 14, 7],
    legalSource: 'ЗСч',
    lastVerifiedOn: null,
    enabled: true,
  },
  {
    key: 'annual-vat-threshold-review',
    title: 'Прегледай оборота спрямо прага за ДДС',
    description:
      'Веднъж годишно, с счетоводителя: какъв е прагът сега и къде е оборотът спрямо него.',
    cadence: { kind: 'yearly', month: 1, dayOfMonth: 31 },
    remindDaysBefore: [14],
    legalSource: 'ЗДДС чл. 96',
    lastVerifiedOn: null,
    enabled: true,
  },
] as const

export interface ComplianceOccurrence {
  rule: ComplianceRule
  /** The date it falls due, at midnight in the shop's own zone. */
  dueOn: Date
  /** Whole days from `from` to `dueOn`. Negative once it has passed. */
  daysAway: number
  /** True when `daysAway` has reached one of the rule's reminder offsets. */
  reminding: boolean
  overdue: boolean
}

/** Sofia, like every other date this shop reasons about. */
const TIME_ZONE = 'Europe/Sofia'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Today in Sofia as `[year, month, day]`, so "how many days away" is counted in
 * calendar days there rather than in UTC — which on an evening in Bulgaria is
 * yesterday, and would make a deadline look a day further off than it is.
 */
function sofiaToday(from: Date): [number, number, number] {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(from)

  const [year, month, day] = parts.split('-').map(Number)

  return [year, month, day]
}

/** A calendar day as a UTC instant, for subtracting whole days without drift. */
function dayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * The next occurrence of each enabled rule, soonest first.
 *
 * Monthly rules resolve to this month's date if it has not passed, otherwise
 * next month's; yearly ones to this year's or next year's. The one exception is
 * a rule whose date has just passed and which is still inside its own reminder
 * window — an overdue deadline stays on the list rather than jumping a year
 * forward and disappearing, because a missed filing is exactly what the shop
 * needs to see.
 */
export function upcomingCompliance(
  from: Date = new Date(),
  rules: readonly ComplianceRule[] = COMPLIANCE_RULES
): ComplianceOccurrence[] {
  const [year, month, day] = sofiaToday(from)
  const today = dayStart(year, month, day)

  const occurrences = rules
    .filter((rule) => rule.enabled)
    .map((rule) => {
      const candidates: Date[] = []

      if (rule.cadence.kind === 'monthly') {
        candidates.push(
          dayStart(year, month - 1, rule.cadence.dayOfMonth),
          dayStart(year, month, rule.cadence.dayOfMonth),
          dayStart(year, month + 1, rule.cadence.dayOfMonth)
        )
      } else {
        candidates.push(
          dayStart(year - 1, rule.cadence.month, rule.cadence.dayOfMonth),
          dayStart(year, rule.cadence.month, rule.cadence.dayOfMonth),
          dayStart(year + 1, rule.cadence.month, rule.cadence.dayOfMonth)
        )
      }

      const furthestBack = Math.max(...rule.remindDaysBefore, 0)
      // A date already passed still counts while it is within its own reminder
      // window, so "overdue by two days" is visible instead of being replaced by
      // the same deadline a year away.
      const dueOn =
        candidates.find((candidate) => candidate.getTime() >= today.getTime()) ??
        candidates[candidates.length - 1]
      const recentlyMissed = candidates
        .filter((candidate) => candidate.getTime() < today.getTime())
        .find(
          (candidate) => (today.getTime() - candidate.getTime()) / MS_PER_DAY <= furthestBack
        )

      const effective = recentlyMissed ?? dueOn
      const daysAway = Math.round((effective.getTime() - today.getTime()) / MS_PER_DAY)

      return {
        rule,
        dueOn: effective,
        daysAway,
        reminding: daysAway <= Math.max(...rule.remindDaysBefore, 0),
        overdue: daysAway < 0,
      }
    })

  return occurrences.sort((a, b) => a.daysAway - b.daysAway)
}

// ---------------------------------------------------------------------------
// What the accountant wants each month
// ---------------------------------------------------------------------------

export interface AccountantRequirement {
  key: string
  label: string
  /** Whether the shop can produce it at all today. See the accounting README. */
  available: boolean
  /** Why not, when it cannot. Shown in settings so the list is not a mystery. */
  unavailableReason?: string
}

/**
 * The checklist the monthly close and the export are measured against.
 *
 * `available: false` entries are listed and disabled rather than hidden,
 * because "we do not send a courier report" is a fact the owner should see
 * stated rather than infer from an absence. Each one names what is missing — a
 * contract, a provider, a column — so the list doubles as the answer to "why
 * can I not tick this".
 */
export const ACCOUNTANT_REQUIREMENTS: readonly AccountantRequirement[] = [
  { key: 'sales', label: 'Отчет за продажбите', available: true },
  { key: 'invoices', label: 'Издадени фактури', available: true },
  { key: 'expenses', label: 'Отчет за разходите', available: true },
  {
    key: 'expense-documents',
    label: 'Документи по разходите',
    available: false,
    unavailableReason:
      'Няма хранилище за файлове. Разходите се водят с номер на документ, а самите документи още се пазят извън системата.',
  },
  {
    key: 'bank-statement',
    label: 'Банково извлечение',
    available: false,
    unavailableReason: 'Няма хранилище за файлове и няма внос на извлечения.',
  },
  {
    key: 'courier',
    label: 'Отчет от куриера',
    available: false,
    unavailableReason:
      'Econt не дава отчет през API-то, което ползваме; Speedy чака договор. Изтегля се от my.econt.com.',
  },
  {
    key: 'cod',
    label: 'Отчет за наложените платежи',
    available: true,
  },
  {
    key: 'refunds',
    label: 'Отчет за възстановените суми',
    available: false,
    unavailableReason:
      'Поръчката пази статус „възстановена“, но не и сума — няма колона, от която да се събере отчет.',
  },
  {
    key: 'payment-provider',
    label: 'Отчет от платежен доставчик',
    available: false,
    unavailableReason: 'Магазинът работи само с наложен платеж — няма доставчик, който да отчита.',
  },
] as const

/** The requirements the shop can actually produce, for the close and the export. */
export function availableRequirements(): readonly AccountantRequirement[] {
  return ACCOUNTANT_REQUIREMENTS.filter((requirement) => requirement.available)
}
