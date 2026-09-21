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
   * The gate for launch, and it now bites unconditionally: every placeholder was
   * answered on 2026-09-21, so a reappearing marker is a regression rather than a
   * decision still outstanding. `LEGAL_IS_DRAFT` remains a separate statement —
   * it says no Bulgarian lawyer has reviewed the wording yet, which no amount of
   * filling in blanks can settle.
   */
  it('has no unresolved placeholders left in any document', () => {
    const remaining: string[] = []

    for (const { key } of LEGAL_DOCS) {
      for (const [locale, messages] of [
        ['en', enMessages],
        ['bg', bgMessages],
      ] as const) {
        for (const section of doc(messages as Catalogue, key).sections) {
          if (section.body.includes('[TODO') || section.heading.includes('[TODO')) {
            remaining.push(`${locale}/${key}: ${section.heading}`)
          }
        }
      }
    }

    expect(remaining, `[TODO] markers are back:\n  ${remaining.join('\n  ')}`).toEqual([])
  })

  it('is published rather than drafted, and keeps the banner copy to hand', () => {
    // The banner came down on 2026-09-21. The strings stay in the catalogue on
    // purpose: reopening the texts means setting the flag, not rewriting copy,
    // and a missing message would crash the page it is meant to warn on.
    expect(LEGAL_IS_DRAFT).toBe(false)

    for (const messages of [enMessages, bgMessages] as const) {
      const legal = messages.legal as unknown as {
        draftNoticeTitle: string
        draftNoticeBody: string
      }
      expect(legal.draftNoticeTitle.length).toBeGreaterThan(0)
      expect(legal.draftNoticeBody.length).toBeGreaterThan(0)
      // Whatever it says, it may not promise that "[TODO]" marks what is
      // outstanding — nothing is marked any more.
      expect(legal.draftNoticeBody).not.toContain('TODO')
    }
  })

  it('numbers every section once, in order', () => {
    // Inserting a clause means renumbering the ones after it, and a duplicated
    // "13." is the mistake that survives review because each page looks fine on
    // its own. Cheap to assert, so it is asserted.
    for (const { key } of LEGAL_DOCS) {
      for (const [locale, messages] of [
        ['en', enMessages],
        ['bg', bgMessages],
      ] as const) {
        const numbers = doc(messages as Catalogue, key).sections.map((section) => {
          const match = /^(\d+)\./.exec(section.heading)
          return match ? Number(match[1]) : null
        })

        const numbered = numbers.filter((n): n is number => n !== null)
        expect(numbered, `${locale}/${key} numbering`).toEqual(
          numbered.map((_, index) => index + 1)
        )
      }
    }
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
