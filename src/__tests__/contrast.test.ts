import { describe, it, expect } from 'vitest'
import config from '../../tailwind.config'

/**
 * Guards the palette against WCAG AA regressions.
 *
 * The cream backgrounds are light, so it is easy to pick a "muted" text
 * colour that looks right and fails badly. Every foreground token below is
 * used at body size or smaller somewhere in the UI, so 4.5:1 applies
 * (WCAG 2.1 SC 1.4.3) — the 3:1 large-text allowance does not.
 */

function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function relativeLuminance(hex: string): number {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

export function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg)
  const b = relativeLuminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

// Read the real tokens rather than duplicating hex values here, so the test
// fails if someone edits the config.
const colors = config.theme?.extend?.colors as Record<string, never>
const cream = colors.cream as unknown as Record<string, string>
const ink = colors.ink as unknown as Record<string, string>
const pastel = colors.pastel as unknown as Record<string, string>
const paper = colors.paper as unknown as Record<string, string>

/**
 * Every colour a section is allowed to use as a ground.
 *
 * The pastel scale is enumerated from the config rather than listed by hand, so
 * adding a tint to the palette automatically adds it to this matrix. That is
 * the point: a new tint that fails with `clay` should fail the build, not ship.
 */
const backgrounds: Record<string, string> = {
  'cream-base': cream.base,
  'cream-surface': cream.surface,
  'cream-muted': cream.muted,
  'paper-white': paper.white,
  'paper-soft': paper.soft,
  ...Object.fromEntries(Object.entries(pastel).map(([name, hex]) => [`pastel-${name}`, hex])),
}

const foregrounds: Record<string, string> = {
  charcoal: colors.charcoal as unknown as string,
  clay: colors.clay as unknown as string,
  'ink-primary': ink.primary,
  'ink-secondary': ink.secondary,
  'ink-ghost': ink.ghost,
}

const AA_NORMAL_TEXT = 4.5

describe('palette contrast', () => {
  for (const [fgName, fg] of Object.entries(foregrounds)) {
    for (const [bgName, bg] of Object.entries(backgrounds)) {
      it(`${fgName} on ${bgName} meets WCAG AA for normal text`, () => {
        const ratio = contrastRatio(fg, bg)
        expect(
          ratio,
          `${fgName} (${fg}) on ${bgName} (${bg}) is ${ratio.toFixed(2)}:1, needs ${AA_NORMAL_TEXT}:1`
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
      })
    }
  }

  // cream-base on charcoal is the inverted pairing used by the CTA banner and
  // the primary buttons.
  it('cream-base on charcoal meets WCAG AA', () => {
    expect(contrastRatio(cream.base, colors.charcoal as unknown as string)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT
    )
  })

  it('cream-base on clay meets WCAG AA (button hover state)', () => {
    expect(contrastRatio(cream.base, colors.clay as unknown as string)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT
    )
  })

  it('preserves the visual hierarchy: ghost lighter than secondary', () => {
    expect(relativeLuminance(ink.ghost)).toBeGreaterThan(relativeLuminance(ink.secondary))
  })

  // The brief is "nothing pure black". Guard the palette against a future edit
  // that quietly reintroduces it, in any of the spellings that would.
  it('contains no pure black', () => {
    // `colors` is typed as a flat record so the lookups above stay terse, but
    // it is really one level deeper in places (`ink.primary`). Flatten both
    // shapes into `name -> hex` pairs before checking.
    const palette = colors as unknown as Record<string, string | Record<string, string>>
    const flat: Array<[string, string]> = []

    for (const [name, value] of Object.entries(palette)) {
      if (typeof value === 'string') flat.push([name, value])
      else for (const [sub, hex] of Object.entries(value)) flat.push([`${name}-${sub}`, hex])
    }

    const black = flat.filter(([, hex]) => /^#(000|000000)$/i.test(hex.trim()))
    expect(black, 'use the warm cocoa `charcoal` token instead of black').toEqual([])
  })

  /**
   * `brand.sand` is the announcement bar and the footer. It is darker than the
   * pastel tints, so it gets its own rules rather than joining the matrix
   * above — which would fail, and rightly.
   *
   * The permitted foregrounds are asserted to pass. The excluded ones are
   * asserted to *fail*, so that if someone lightens the sand later the test
   * turns red and tells them the restriction in the Footer comment is now
   * unnecessary, rather than leaving a stale warning in the code forever.
   */
  describe('brand.sand', () => {
    const sand = (colors.brand as unknown as Record<string, string>).sand

    for (const [name, hex] of [
      ['ink-primary', ink.primary],
      ['ink-secondary', ink.secondary],
    ] as const) {
      it(`${name} on brand-sand meets WCAG AA`, () => {
        const ratio = contrastRatio(hex, sand)
        expect(ratio, `${name} (${hex}) on sand (${sand}) is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          AA_NORMAL_TEXT
        )
      })
    }

    for (const [name, hex] of [
      ['clay', colors.clay as unknown as string],
      ['ink-ghost', ink.ghost],
    ] as const) {
      it(`${name} is still too light for body text on brand-sand`, () => {
        const ratio = contrastRatio(hex, sand)
        expect(
          ratio,
          `${name} now clears AA on sand — the restriction documented in Footer.tsx can be lifted`
        ).toBeLessThan(AA_NORMAL_TEXT)
      })
    }
  })

  // `charcoal` is the one dial for "black". If it drifts cold, the whole warm
  // palette goes with it, so assert the warmth rather than trusting review.
  it('charcoal is a warm neutral, not a grey', () => {
    const hex = (colors.charcoal as unknown as string).replace('#', '')
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))

    expect(r, 'red channel should lead in a warm neutral').toBeGreaterThan(b)
    expect(r - b, 'too close to neutral grey to read as cocoa').toBeGreaterThanOrEqual(8)
  })
})
