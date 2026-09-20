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
   */
  vatNumber: '[TODO: ДДС номер, or confirm not VAT-registered]' as Todo | string,
  isVatRegistered: null as boolean | null,

  /** Registered seat (седалище и адрес на управление) from the Търговски регистър. */
  address: {
    street: '[TODO: street and number]' as Todo | string,
    city: '[TODO: city]' as Todo | string,
    postalCode: '[TODO: postal code]' as Todo | string,
    country: 'Bulgaria',
    countryCode: 'BG',
  },

  /** Управител — required on the impressum. */
  manager: '[TODO: name of управител]' as Todo | string,

  contact: {
    /**
     * A monitored email address is not optional: consumers must be able to
     * withdraw from a contract in a durable medium, and Instagram DMs do not
     * qualify. Instagram and phone are the only channels on the site today.
     */
    email: '[TODO: contact email on your own domain]' as Todo | string,
    phone: '+359887115957',
    phoneDisplay: '+359 887 115 957',
    instagram: '55candles.bg',
    instagramUrl: 'https://www.instagram.com/55candles.bg/',
  },
} as const

/** Formatted registered address, or the TODO markers if it is unset. */
export function formatAddress(): string {
  const { street, postalCode, city, country } = company.address
  return [street, `${postalCode} ${city}`.trim(), country].filter(Boolean).join(', ')
}

/**
 * Every unresolved identity field, so a test can assert the impressum is
 * complete before launch and the owner gets one list instead of a hunt.
 */
export function missingIdentityFields(): string[] {
  const missing: string[] = []

  const checks: Array<[string, string]> = [
    ['vatNumber', company.vatNumber],
    ['manager', company.manager],
    ['contact.email', company.contact.email],
    ['address.street', company.address.street],
    ['address.city', company.address.city],
    ['address.postalCode', company.address.postalCode],
  ]

  for (const [field, value] of checks) {
    if (isTodo(value)) missing.push(field)
  }

  if (company.isVatRegistered === null) missing.push('isVatRegistered')

  return missing
}

export const isIdentityComplete = () => missingIdentityFields().length === 0
