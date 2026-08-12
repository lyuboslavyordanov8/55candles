import Image from 'next/image'

/**
 * The 55° candles wordmark.
 *
 * The source file the owner supplied was a flat tan wordmark on an opaque white
 * background. It is stored here with that white knocked out — the alpha is
 * recovered by un-blending each pixel from white, so the anti-aliased edges
 * survive — because a white rectangle would show as a box anywhere but the
 * navbar.
 *
 * **Contrast note.** The mark is #A69071, which is 3.07:1 on white and 2.35:1
 * on `brand-sand`. WCAG exempts logotypes from contrast minimums (SC 1.4.3
 * explicitly excludes text that is part of a logo or brand name), so this is
 * compliant — but it is genuinely faint on the sand, which is why the footer
 * uses the oversized sign-off rather than this mark.
 *
 * Sized by height, with width following. The `h-* w-auto` pairing is the
 * documented way to scale a next/image with intrinsic dimensions.
 */
/**
 * **The filename encodes the colour, and that is deliberate.**
 *
 * Next's image optimizer caches by URL. Recolouring the mark in place left the
 * path unchanged, so the cache key never changed and the optimizer went on
 * serving the old tan version — the file on disk was correct and the page was
 * not. Browsers and CDNs cache on the same key.
 *
 * So a recolour gets a new filename, e.g. logo-cream for a mark on a dark
 * ground. Same rule for any asset under public/ that is replaced rather than
 * added — the banner has already been three different pictures under one name.
 */
const LOGO = {
  src: '/images/logo-ink.png',
  width: 750,
  height: 93,
  alt: '55° candles',
} as const

interface Props {
  /** Tailwind height plus `w-auto`. Defaults to the navbar's sizing. */
  className?: string
  priority?: boolean
  /**
   * Rendered width, for picking a srcset entry. Without it next/image assumes
   * the intrinsic 750px and serves a 4 KB variant for a mark displayed at
   * 161px; declaring the real size drops it to about 2.5 KB while still
   * serving enough pixels for a 2× screen.
   *
   * Update it alongside `className` — they describe the same thing.
   */
  sizes?: string
}

export default function Logo({
  className = 'h-4 w-auto md:h-5',
  priority = false,
  sizes = '161px',
}: Props) {
  return (
    <Image
      src={LOGO.src}
      alt={LOGO.alt}
      width={LOGO.width}
      height={LOGO.height}
      priority={priority}
      sizes={sizes}
      className={className}
    />
  )
}
