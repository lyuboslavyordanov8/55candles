/**
 * Legal identity of the trader behind 55° candles.
 *
 * Single source of truth for the impressum (AUDIT.md B-16), the legal pages
 * (B-15) and the Organization JSON-LD (S-12). Everything a consumer-facing
 * page needs to identify who they are contracting with comes from here, so
 * there is exactly one place to correct if a detail is wrong.
 *
 * `55° candles` is the trading/brand name; `ВиреонЛабс ЕООД` is the legal entity.
 * Bulgarian consumer law requires the *legal entity* to be identifiable, not
 * just the brand.
 *
 * ## Fields still unconfirmed
 *
 * Values typed as `Todo` are **not guessed** — they are the remaining gaps the
 * owner has to supply, and they render visibly as `[TODO: …]` rather than
 * silently as an empty string, so an unfinished impressum cannot ship quietly.
 * `npm test` fails once `requireCompleteIdentity` is switched on for launch.
 */

/** A value the owner still has to supply. Renders visibly, never blank. */
export type Todo = `[TODO: ${string}]`

export function isTodo(value: string): value is Todo {
  return value.startsWith('[TODO:')
}

export const company = {
  /** Legal entity name, Bulgarian — as registered in the Търговски регистър. */
  legalName: 'ВиреонЛабс ЕООД',
  /** Latin transliteration, for the English locale and structured data. */
  legalNameLatin: 'VireonLabs EOOD',
  /**
   * Trading name shown to customers.
   *
   * The owner's spelling, degree sign and all: it appears in the legal pages,
   * the impressum and the Organization JSON-LD, so it is the name a customer
   * would have to recognise on a receipt or a complaint. Change it only when
   * the owner changes how the business trades, not for typography.
   */
  tradingName: '55° candles',
  /** Единен идентификационен код (company registration number). */
  eik: '208907603',

  /**
   * ДДС номер. A Bulgarian VAT number is the ЕИК prefixed with `BG`, but only
   * once the company is actually VAT-registered — which is a fact about the
   * company, not a string transformation. Do not derive it from the ЕИК.
   * Registration is mandatory above the turnover threshold and optional below
   * it, and it changes what the prices on this site must include.
   *
   * Not registered, as confirmed by the owner on 2026-09-21: `null`, because
   * there is no number to publish. The impressum says so in words rather than
   * dropping the row — "ДДС №" left blank reads as an oversight, and a customer
   * comparing prices is entitled to know no VAT is charged on them.
   */
  vatNumber: null as string | null,
  isVatRegistered: false,

  /**
   * Registered seat (седалище и адрес на управление) from the Търговски регистър,
   * confirmed by the owner on 2026-09-21.
   *
   * Kept in Cyrillic on both locales: this is the address as it is registered, and
   * a transliteration would not be the registered seat. `street` carries the
   * district and the housing estate as well as the street, because that is the
   * whole of what the register holds — splitting them out would invent fields the
   * impressum and `PostalAddress` have nowhere to put.
   */
  address: {
    street: 'р-н Студентски, ж.к. Малинова долина, ул. „Еньо Вълчев“ 1А',
    city: 'София',
    postalCode: '1734',
    country: 'Bulgaria',
    countryName: { bg: 'България', en: 'Bulgaria' } as Record<string, string>,
    countryCode: 'BG',
  },

  /**
   * Управител.
   *
   * `null` by the owner's decision of 2026-09-21, and lawfully so: ТЗ чл. 13 and
   * ЗЕТ чл. 4 require the firm, the seat and address of management, the ЕИК and a
   * VAT number where there is one — not the name of the manager, which anyone can
   * look up against the ЕИК in the Търговски регистър anyway. Put a name here and
   * the impressum row reappears.
   */
  manager: null as string | null,

  contact: {
    /**
     * A monitored email address is not optional: consumers must be able to
     * withdraw from a contract in a durable medium, and Instagram DMs do not
     * qualify.
     *
     * This one **receives**, which is the whole point — it forwards to the owners'
     * mailboxes (ImprovMX, MX records on the apex). It is deliberately not
     * `EMAIL_FROM`: that address sends and cannot receive, so publishing it would
     * put an address on the impressum that silently swallows every reply.
     */
    email: 'contact@55candles.com' as Todo | string,
    /**
     * Deliberately unpublished, by the owner's decision of 2026-09-21: the shop is
     * run from a personal number and does not want it on the open web.
     *
     * `null`, not a `[TODO:]` marker — a marker means "nobody has decided yet" and
     * gets rendered on the page until someone does. This is a decision, so every
     * consumer omits the field instead of showing a placeholder. Setting it to a
     * number is all that is needed to bring it back everywhere.
     *
     * Lawful because the email address below receives and is published: distance
     * selling requires contact data including email, and a phone number only
     * "where available". The customer's own phone is unaffected — the courier
     * cannot deliver without it.
     */
    phone: null as string | null,
    phoneDisplay: null as string | null,
    instagram: '55candles.bg',
    instagramUrl: 'https://www.instagram.com/55candles.bg/',
  },
} as const

/**
 * Formatted registered address, or the TODO markers if it is unset.
 *
 * The locale only picks the country name: the rest is the registered wording and
 * does not translate. Reading "…, София, Bulgaria" on the Bulgarian impressum was
 * the one part that looked like a bug rather than a legal address.
 */
export function formatAddress(locale?: string): string {
  const { street, postalCode, city, country, countryName } = company.address
  const land = (locale && countryName[locale]) || country
  return [street, `${postalCode} ${city}`.trim(), land].filter(Boolean).join(', ')
}

/**
 * Every unresolved identity field, so a test can assert the impressum is
 * complete before launch and the owner gets one list instead of a hunt.
 */
export function missingIdentityFields(): string[] {
  const missing: string[] = []

  // `null` is not missing — it is a decision that a field has no value (no VAT
  // registration, no published manager or phone), and every consumer omits it.
  // Only a `[TODO:]` marker means nobody has decided yet.
  const checks: Array<[string, string | null]> = [
    ['vatNumber', company.vatNumber],
    ['manager', company.manager],
    ['contact.email', company.contact.email],
    ['address.street', company.address.street],
    ['address.city', company.address.city],
    ['address.postalCode', company.address.postalCode],
  ]

  for (const [field, value] of checks) {
    if (value !== null && isTodo(value)) missing.push(field)
  }

  if (company.isVatRegistered === null) missing.push('isVatRegistered')

  return missing
}

export const isIdentityComplete = () => missingIdentityFields().length === 0
