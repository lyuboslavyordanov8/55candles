import { describe, it, expect } from 'vitest'
import enMessages from '../../messages/en.json'
import bgMessages from '../../messages/bg.json'
import { LEGAL_DOCS, LEGAL_IS_DRAFT, isLegalSlug, legalPath } from '../lib/legal'
import {
  company,
  formatAddress,
  isIdentityComplete,
  missingIdentityFields,
  isTodo,
} from '../lib/company'

type Catalogue = typeof enMessages

function doc(messages: Catalogue, key: string) {
  const docs = (messages.legal as unknown as { docs: Record<string, unknown> }).docs
  return docs[key] as { title: string; summary: string; sections: Array<{ heading: string; body: string }> }
}

describe('legal documents', () => {
  it('has the six documents Bulgarian distance selling requires', () => {
    expect(LEGAL_DOCS.map((d) => d.slug)).toEqual([
      'terms',
      'privacy',
      'cookies',
      'returns',
      'complaints',
      'delivery',
    ])
  })

  it('exists in both catalogues with matching section counts', () => {
    for (const { key } of LEGAL_DOCS) {
      const en = doc(enMessages, key)
      const bg = doc(bgMessages, key)

      expect(en, `en.json is missing legal.docs.${key}`).toBeDefined()
      expect(bg, `bg.json is missing legal.docs.${key}`).toBeDefined()

      expect(en.title.length).toBeGreaterThan(0)
      expect(bg.title.length).toBeGreaterThan(0)

      // Divergent section counts mean one locale is missing legal content the
      // other has — for the BG market, that is the one that matters.
      expect(
        bg.sections.length,
        `legal.docs.${key} has ${en.sections.length} sections in en but ${bg.sections.length} in bg`
      ).toBe(en.sections.length)
    }
  })

  it('gives every section a heading and a body in both locales', () => {
    for (const { key } of LEGAL_DOCS) {
      for (const messages of [enMessages, bgMessages]) {
        for (const section of doc(messages as Catalogue, key).sections) {
          expect(section.heading.trim().length).toBeGreaterThan(0)
          expect(section.body.trim().length).toBeGreaterThan(20)
        }
      }
    }
  })

  it('names the legal entity, not just the brand, in the Bulgarian terms', () => {
    // B-16: a consumer must be able to identify who they are contracting with.
    const terms = doc(bgMessages, 'terms')
    const body = terms.sections.map((s) => s.body).join(' ')

    expect(body).toContain('ВиреонЛабс')
    expect(body).toContain(company.eik)
  })

  it('validates slugs', () => {
    expect(isLegalSlug('terms')).toBe(true)
    expect(isLegalSlug('privacy')).toBe(true)
    expect(isLegalSlug('nope')).toBe(false)
    expect(isLegalSlug(undefined)).toBe(false)
    expect(isLegalSlug(123)).toBe(false)
  })

  it('builds locale-prefixed paths with untranslated slugs', () => {
    // Translating the slug would break the hreflang pairing between locales.
    expect(legalPath('bg', 'terms')).toBe('/bg/legal/terms')
    expect(legalPath('en', 'terms')).toBe('/en/legal/terms')
  })

  /**
   * The gate for launch. While LEGAL_IS_DRAFT is true this only reports, but
   * once the flag flips the assertions bite — so the drafts cannot be marked
   * reviewed while placeholders remain.
   */
  it('has no unresolved placeholders once the draft flag is cleared', () => {
    const remaining: string[] = []

    for (const { key } of LEGAL_DOCS) {
      for (const [locale, messages] of [
        ['en', enMessages],
        ['bg', bgMessages],
      ] as const) {
        for (const section of doc(messages as Catalogue, key).sections) {
          if (section.body.includes('[TODO')) {
            remaining.push(`${locale}/${key}: ${section.heading}`)
          }
        }
      }
    }

    if (LEGAL_IS_DRAFT) {
      // Documented, not asserted: these are the owner's outstanding decisions.
      expect(remaining.length).toBeGreaterThan(0)
      return
    }

    expect(
      remaining,
      `LEGAL_IS_DRAFT is false but [TODO] markers remain:\n  ${remaining.join('\n  ')}`
    ).toEqual([])
  })
})

describe('trader identity', () => {
  it('records the confirmed company details', () => {
    expect(company.legalName).toBe('ВиреонЛабс ЕООД')
    expect(company.eik).toBe('208907603')
    expect(company.tradingName).toBe('55° candles')
  })

  it('does not derive the VAT number from the ЕИК', () => {
    // BG + ЕИК is the *format*, but only once actually VAT-registered, which is
    // a fact about the company. Guessing it would put a false number on invoices.
    expect(company.vatNumber).not.toBe(`BG${company.eik}`)
  })

  it('publishes no VAT number while the company is not registered', () => {
    // The two have to agree. A number with the flag false would be a false number
    // on the impressum; the flag true with no number would be a missing one.
    expect(company.isVatRegistered).toBe(false)
    expect(company.vatNumber).toBeNull()
  })

  it('records the registered seat', () => {
    // As held by the Търговски регистър, in Cyrillic — the impressum has to match
    // the register, so this asserts the parts rather than the formatting.
    expect(company.address.city).toBe('София')
    expect(company.address.postalCode).toBe('1734')
    expect(company.address.street).toContain('Еньо Вълчев')
    expect(formatAddress('bg')).toContain('България')
    expect(formatAddress('en')).toContain('Bulgaria')
  })

  it('renders unresolved fields visibly rather than blank', () => {
    for (const field of missingIdentityFields()) {
      expect(field.length).toBeGreaterThan(0)
    }
    // Whatever is unset must be a visible marker or a deliberate `null`, never an
    // empty string — `null` is omitted by every consumer, `''` renders as a blank
    // row that looks like a shop which has lost its own details.
    for (const value of [company.manager, company.vatNumber, company.contact.email]) {
      if (value === null) continue
      expect(value.length, 'identity fields must never be empty strings').toBeGreaterThan(0)
      if (isTodo(value)) expect(value).toMatch(/^\[TODO:/)
    }
  })

  it('has every trader-identity field the impressum needs', () => {
    // The owner supplied the last of them on 2026-09-21. This is the assertion the
    // old "lists what is still missing" test existed to grow into, and it now
    // guards against a field being emptied again.
    expect(missingIdentityFields()).toEqual([])
    expect(isIdentityComplete()).toBe(true)
  })
})
