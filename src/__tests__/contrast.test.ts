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

const backgrounds: Record<string, string> = {
  'cream-base': cream.base,
  'cream-surface': cream.surface,
  'cream-muted': cream.muted,
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
})
