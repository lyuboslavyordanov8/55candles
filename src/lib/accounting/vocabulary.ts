/**
 * The words the accounting module uses, in the language the owner speaks.
 *
 * Keys are stored, labels are shown, and nothing here is a database enum: a
 * shop that starts buying a new kind of thing should be able to add a category
 * in a pull request, not a migration. The trade is that a key no longer in this
 * file still exists on old rows, which is why every lookup falls back to the raw
 * key rather than rendering blank.
 *
 * **No category here implies anything about tax.** "Реклама" is a category, not
 * a deduction; whether an expense reduces anything is the accountant's call and
 * this module never guesses at it.
 */

export interface Vocabulary {
  key: string
  label: string
  /** Grouping for the picker, so twenty categories are not one flat list. */
  group?: string
}

export const EXPENSE_CATEGORIES: readonly Vocabulary[] = [
  { key: 'wax', label: 'Восък', group: 'Материали' },
  { key: 'fragrance', label: 'Ароматни масла', group: 'Материали' },
  { key: 'wicks', label: 'Фитили', group: 'Материали' },
  { key: 'containers', label: 'Съдове', group: 'Материали' },
  { key: 'packaging', label: 'Опаковки', group: 'Материали' },
  { key: 'labels', label: 'Етикети и печат', group: 'Материали' },
  { key: 'inventory', label: 'Стоки за продажба', group: 'Материали' },

  { key: 'shipping', label: 'Доставка и куриер', group: 'Логистика' },

  { key: 'ads-meta', label: 'Реклама — Meta', group: 'Реклама' },
  { key: 'ads-google', label: 'Реклама — Google', group: 'Реклама' },
  { key: 'ads-other', label: 'Реклама — друго', group: 'Реклама' },
  { key: 'photography', label: 'Продуктова фотография', group: 'Реклама' },

  { key: 'software', label: 'Софтуер и абонаменти', group: 'Онлайн' },
  { key: 'hosting', label: 'Хостинг', group: 'Онлайн' },
  { key: 'domains', label: 'Домейни', group: 'Онлайн' },

  { key: 'equipment', label: 'Оборудване', group: 'Работа' },
  { key: 'office', label: 'Консумативи', group: 'Работа' },
  { key: 'services', label: 'Външни услуги', group: 'Работа' },
  { key: 'accounting', label: 'Счетоводство', group: 'Работа' },
  { key: 'bank-fees', label: 'Банкови такси', group: 'Работа' },

  { key: 'other', label: 'Друго', group: 'Друго' },
] as const

export const EXPENSE_PAYMENT_METHODS: readonly Vocabulary[] = [
  { key: 'card', label: 'Фирмена карта' },
  { key: 'bank', label: 'Банков превод' },
  { key: 'cash', label: 'В брой' },
] as const

/**
 * How far an expense has got, in words the owner uses rather than a bookkeeper's.
 *
 * `needs_review` is where everything starts: a row saved in fifteen seconds from
 * a phone is not a checked row, and pretending otherwise is how a wrong total
 * reaches an accountant.
 */
export const EXPENSE_STATUSES: readonly Vocabulary[] = [
  { key: 'needs_review', label: 'За преглед' },
  { key: 'ready', label: 'Готов' },
  { key: 'sent', label: 'Изпратен на счетоводител' },
  { key: 'accounted', label: 'Осчетоводен' },
] as const

export const PERIOD_STATUSES: readonly Vocabulary[] = [
  { key: 'open', label: 'Отворен' },
  { key: 'ready', label: 'Готов за счетоводител' },
  { key: 'exported', label: 'Изпратен' },
  { key: 'completed', label: 'Приключен' },
] as const

/** The label for a key, or the key itself when it is one this build has forgotten. */
export function labelOf(vocabulary: readonly Vocabulary[], key: string): string {
  return vocabulary.find((entry) => entry.key === key)?.label ?? key
}

export function isKnownKey(vocabulary: readonly Vocabulary[], key: string): boolean {
  return vocabulary.some((entry) => entry.key === key)
}

/** The categories grouped for a `<select>`, in the order declared above. */
export function groupedCategories(): { group: string; entries: Vocabulary[] }[] {
  const groups: { group: string; entries: Vocabulary[] }[] = []

  for (const entry of EXPENSE_CATEGORIES) {
    const group = entry.group ?? 'Друго'
    const existing = groups.find((candidate) => candidate.group === group)

    if (existing) existing.entries.push(entry)
    else groups.push({ group, entries: [entry] })
  }

  return groups
}
