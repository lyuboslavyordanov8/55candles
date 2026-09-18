import type { Courier } from '@/lib/shipping'

/**
 * A courier's own logo, for the checkout's courier choice.
 *
 * Recognition is the entire point: a customer scanning the form knows the blue
 * ЕКОНТ wordmark and the red Speedy cube long before they read either name. So
 * the mark *is* the label — there is no text beside it, which would only repeat
 * the word already drawn in the picture. The `alt` carries the courier's name,
 * translated, so it is what a screen reader announces and what the radio's
 * accessible name resolves to.
 *
 * ## Where these files came from
 *
 * Both are the couriers' own published marks, self-hosted under `public/` —
 * never hot-linked, because the CSP is `img-src 'self' data: blob:` and because
 * a checkout should not depend on a third party's CDN being up.
 *
 * - `econt-blue-*.svg` — Econt's vector wordmark from
 *   `econt.com/images/main/econt-logo-{bg,en}-white.svg`. They publish it in
 *   white for their own dark navbar, which is invisible on cream, so the fill is
 *   changed to `#234182` — Econt's own brand blue, the colour in their
 *   `mask-icon` and throughout their stylesheet. Geometry untouched.
 * - `speedy.webp` — Speedy's wordmark from `speedy.bg`, published as a PNG on an
 *   opaque white background. The white is knocked out to alpha by un-blending
 *   each pixel from white, the same treatment `Logo.tsx` documents for the shop's
 *   own mark, or it would render as a white card on the cream.
 *
 * Displaying a carrier's logo to identify the carrier being offered is ordinary
 * nominative use. If either courier supplies a brand pack under the merchant
 * contract, replace these files with it — and per the rule in `Logo.tsx`, give a
 * recoloured replacement a *new filename*, since Next's optimizer and every CDN
 * cache on the URL.
 *
 * ## Why `<img>` and not `next/image`
 *
 * The Econt marks are SVG, and the image optimizer rejects SVG unless
 * `dangerouslyAllowSVG` is set — which would apply to every image on the site
 * to accommodate two files we control. There is nothing to optimise anyway: the
 * SVGs are ~2.5 kB of vector, and `speedy.webp` is already WebP at 9 kB.
 * `width`/`height` are still given so the row cannot shift as the marks load.
 */

interface Mark {
  src: string
  /** Intrinsic ratio, expressed at the rendered height. Prevents layout shift. */
  width: number
  height: number
}

/** Rendered height for every mark, so the two sit on one optical line. */
const HEIGHT = 22

const ECONT_CYRILLIC: Mark = {
  src: '/images/couriers/econt-blue-bg.svg',
  width: 105,
  height: HEIGHT,
}

const ECONT_LATIN: Mark = {
  src: '/images/couriers/econt-blue-en.svg',
  width: 105,
  height: HEIGHT,
}

/** One file for both locales: the Speedy wordmark is Latin either way. */
const SPEEDY: Mark = {
  src: '/images/couriers/speedy.webp',
  width: 73,
  height: HEIGHT,
}

function markFor(courier: Courier, locale: string): Mark {
  if (courier === 'speedy') return SPEEDY

  // Econt publishes ЕКОНТ and ECONT as separate files; matching the page's
  // language is free here, and a Cyrillic mark on an English page reads as a
  // different company.
  return locale.startsWith('bg') ? ECONT_CYRILLIC : ECONT_LATIN
}

interface Props {
  courier: Courier
  locale: string
  /** The courier's name, translated. Becomes the `alt`, so never empty. */
  name: string
}

export default function CourierMark({ courier, locale, name }: Props) {
  const mark = markFor(courier, locale)

  return (
    // eslint-disable-next-line @next/next/no-img-element -- see the header.
    <img
      src={mark.src}
      alt={name}
      width={mark.width}
      height={mark.height}
      className="w-auto"
      style={{ height: HEIGHT }}
      decoding="async"
    />
  )
}
