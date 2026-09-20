import { describe, it, expect } from 'vitest'
import bg from '../../../messages/bg.json'
import en from '../../../messages/en.json'
import { products } from '../products'
import { INGREDIENT_KEYS } from '@/types/product'

/**
 * The catalogue's prose lives in the message files, not in the data.
 *
 * That is what makes the Bulgarian product pages Bulgarian — the descriptor,
 * description, scent notes and ingredient list used to be English strings on
 * the `Product` type and were shown untranslated on both locales (AUDIT.md
 * B-22). The cost of the move is that adding a candle now means adding its copy
 * to two files, and nothing in TypeScript can tell you that you forgot:
 * `t('copy.newSlug.descriptor')` type-checks fine and renders the key.
 *
 * So this is the check. It fails the moment the data and the catalogues
 * disagree, in either direction and in either language.
 */

const catalogues = { bg, en } as const

type Copy = {
  mood: string
  descriptor: string
  description: string
  notes: { top: string; heart: string; base: string }
}

/** The fields every candle's copy block must fill, as dotted paths. */
const COPY_FIELDS = [
  'mood',
  'descriptor',
  'description',
  'notes.top',
  'notes.heart',
  'notes.base',
] as const

function at(copy: Copy, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], copy)
}

describe('product copy', () => {
  for (const [locale, messages] of Object.entries(catalogues)) {
    const copies = messages.product.copy as Record<string, Copy>

    describe(locale, () => {
      it('has a copy block for every candle in the catalogue', () => {
        expect(Object.keys(copies).sort()).toEqual(products.map((p) => p.slug).sort())
      })

      it('fills every field of every copy block with real text', () => {
        for (const product of products) {
          for (const field of COPY_FIELDS) {
            const text = at(copies[product.slug], field)
            expect(typeof text, `${product.slug}.${field} is missing`).toBe('string')
            expect((text as string).trim(), `${product.slug}.${field} is blank`).not.toBe('')
          }
        }
      })

      it('names every ingredient a candle can list', () => {
        const wording = messages.product.ingredient as Record<string, string>

        // Keyed on the vocabulary rather than on what the candles happen to use,
        // so a key stays translated while no product lists it.
        for (const key of INGREDIENT_KEYS) {
          expect(wording[key]?.trim(), `ingredient.${key} is missing`).toBeTruthy()
        }

        expect(Object.keys(wording).sort()).toEqual([...INGREDIENT_KEYS].sort())
      })
    })
  }

  it('lists only known ingredient keys on the products themselves', () => {
    for (const product of products) {
      expect(product.ingredients.length).toBeGreaterThan(0)
      for (const key of product.ingredients) {
        expect(INGREDIENT_KEYS, `${product.slug} lists ${key}`).toContain(key)
      }
    }
  })

  // Not a style rule: the two catalogues are translations of each other, so a
  // candle described in one language and not the other is a bug, and the
  // per-locale checks above would each pass while the site was half-translated.
  it('describes the same candles in both languages', () => {
    expect(Object.keys(bg.product.copy).sort()).toEqual(Object.keys(en.product.copy).sort())
  })
})
