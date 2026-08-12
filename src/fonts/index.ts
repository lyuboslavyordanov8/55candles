import localFont from 'next/font/local'

/**
 * The site's two typefaces, self-hosted from the files in this directory.
 *
 * These replaced `next/font/google` (Montserrat + Playfair Display). Both
 * approaches self-host the final bytes, but the Google loader still fetches
 * from fonts.googleapis.com at *build* time, and Nyght Serif is not on Google
 * Fonts at all. Loading from disk removes the build-time dependency and keeps
 * the claim in our cookie policy — "fonts are served from our own domain" —
 * true by construction rather than by accident.
 *
 * `next/font/local` writes the `@font-face` blocks for us, with the file
 * subsetted and the CSS variable wired up. There is no hand-authored
 * `@font-face` anywhere in this project; adding one would compete with these.
 *
 * Both families cover the full Bulgarian Cyrillic alphabet — verified against
 * their `cmap` tables, since the site is Bulgarian-first and a missing glyph
 * would silently fall back mid-word.
 */

/**
 * Body, UI, buttons, labels, nav and prices. Never headings.
 *
 * Four static weights rather than the variable file: these are the weights the
 * design actually uses, and four subsetted statics beat one variable font
 * carrying an axis we never animate.
 */
export const montserrat = localFont({
  src: [
    { path: './Montserrat-Light.ttf', weight: '300', style: 'normal' },
    { path: './Montserrat-Regular.ttf', weight: '400', style: 'normal' },
    { path: './Montserrat-Medium.ttf', weight: '500', style: 'normal' },
    { path: './Montserrat-SemiBold.ttf', weight: '600', style: 'normal' },
  ],
  variable: '--font-body',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
})

/**
 * Headings only. Nyght Serif ships italic-only, which is exactly the brief:
 * every heading on this site is set in italic.
 *
 * Note each file is registered **twice** — once as `italic`, once as `normal`.
 * The italic entries are the honest description of the bytes. The `normal`
 * entries are a safety net: with an italic-only family, a heading that omits
 * the `italic` class asks for a face that does not exist, and the browser is
 * free to drop through to the fallback stack instead. That renders one heading
 * in Georgia while its neighbours are in Nyght, which is far worse than
 * rendering the italic. Duplicating the registration makes the family answer
 * either request with the same file.
 */
export const nyghtSerif = localFont({
  src: [
    { path: './NyghtSerif-RegularItalic.otf', weight: '400', style: 'italic' },
    { path: './NyghtSerif-RegularItalic.otf', weight: '400', style: 'normal' },
    { path: './NyghtSerif-MediumItalic.otf', weight: '500', style: 'italic' },
    { path: './NyghtSerif-MediumItalic.otf', weight: '500', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
  // Metric-matched fallback while the face loads. Times is the closer shape to
  // a transitional serif than the 'Arial' default.
  adjustFontFallback: 'Times New Roman',
})

/** Both variable classes, for the `<html>` element in the root layout. */
export const fontVariables = `${montserrat.variable} ${nyghtSerif.variable}`
