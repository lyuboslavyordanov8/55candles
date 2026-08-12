import Link from 'next/link'
import Image from 'next/image'
import Reveal from '@/components/motion/Reveal'
import { homeBanner, bannerText } from '@/content/home-banner'

interface Props { locale: string }

/**
 * How much taller than its natural proportions the band is drawn. 1 is
 * uncropped; above that, the sides are cropped to keep the aspect ratio.
 */
const BAND_SCALE = 1.5

/**
 * Ceiling on the band's height, in pixels.
 *
 * The band is sized as a share of the viewport *width*, which is right up to a
 * point and ruinous past it: on a 2560px monitor that share is 755px, and a
 * browser zoomed out reports a viewport several thousand pixels wide and asks
 * for a band to match. The hero grew past 2000px tall. Above roughly 1424px the
 * band simply stops growing and crops a little more instead.
 *
 * **The band's height is set directly, in `vw`, not via `aspect-ratio`.** That
 * is not a stylistic choice. `aspect-ratio` plus `max-height` does not merely
 * cap the height: the browser holds the ratio by shrinking the *width* to
 * match, so at a 2560px viewport the band collapsed to 1425px — 56% of the
 * window — and `left:0 right:0` became over-constrained and pinned it to the
 * left, leaving bare sand across the right of the banner. `vw` decouples the
 * two: the height follows the viewport width, and the width stays 100%.
 */
const BAND_MAX = '420px'

/**
 * How far up the strip its dark artwork reaches, as a share of the strip's
 * height. The text clears this rather than the whole band, because the sky
 * above it is safe to sit on.
 *
 * **Measured, not estimated.** Scan the banner for the topmost pixel whose
 * contrast against `ink-primary` (#2E2521) drops below 4.5:1, across the
 * columns the centred text box covers once the crop is applied. Estimating by
 * eye gave 0.6, which would have put the button on dark green.
 *
 * There are two values because this artwork has a cliff in it. A centred window
 * up to 35% of the image stays clear down to 0.299 — only the middle hill is
 * under it — but at 40% the dark daisy leaves cut in and it jumps to 0.834.
 *
 * The text box is a fixed 672px (`max-w-2xl`), so which side of the cliff we
 * are on depends only on viewport width. Allowing for the crop, the box stops
 * covering more than 35% of the image at 1280px — which is why the breakpoint
 * below is `xl` and not something rounder. Narrower than that, the wide value
 * applies and the banner needs the tall clearance.
 */
const HILLS_SHARE_NARROW = 0.875
const HILLS_SHARE_WIDE = 0.4

/**
 * Full-width banner with the heading, subheading and CTA centred over it.
 *
 * **There is no content in this file.** The image, all four strings and the
 * link target come from `src/content/home-banner.ts` — edit that to change the
 * banner; this file only decides how it is arranged. That separation is the
 * whole point: swapping the banner should never mean reading layout code.
 *
 * ── Why the image is a band and not a background ───────────────────────────
 * The artwork is a wide strip — roughly 5:1 — of flat sand sky with illustrated
 * hills along the bottom. Stretched to cover the whole section it would crop to
 * a narrow slice of itself, so instead it is anchored along the bottom and the
 * section's own `bg-brand-sand` continues the sky above it. The sand token and
 * the artwork's sky differ by one step in the red channel, so the join is
 * invisible and the banner reads as one field.
 *
 * ── BAND_SCALE ─────────────────────────────────────────────────────────────
 * Drawn at its natural proportions the strip is only about 20% of the viewport
 * width tall, which left the banner mostly empty sand. `BAND_SCALE` enlarges
 * it; the excess width is cropped equally from both sides, which costs the
 * daisies at the right edge and the pink shapes at the left.
 *
 * ── Clearance ──────────────────────────────────────────────────────────────
 * The text only has to clear the artwork's *dark* parts, not the whole band:
 * its sky is safe to sit on. `HILLS_SHARE` carries that measurement — see its
 * comment, and re-measure it whenever the banner or BAND_SCALE changes. Raising
 * BAND_SCALE without re-checking is how the button ends up on dark green.
 *
 * Both the band height and the clearance are percentages of *width*, which is
 * unusual but exactly right: percentage padding resolves against the
 * container's width, and the band's height is also a function of width, so the
 * two track each other at every viewport.
 *
 * The header is `fixed` and about 100px tall, hence the `pt-36` — the same
 * clearance every other page uses. This is the only page whose content starts
 * at y=0, so it is the only one that has to think about it.
 *
 * Server Component. Only the entrance animations cross to the client, via
 * Reveal (AUDIT.md S-14).
 */
export default function Hero({ locale }: Props) {
  const {
    image,
    imageWidth,
    imageHeight,
    alt,
    heading,
    subheading,
    ctaLabel,
    ctaHref,
    scrimStrength,
  } = homeBanner

  // Band height as a share of the viewport width, after scaling.
  const bandRatio = (imageHeight / imageWidth) * BAND_SCALE

  // Reserve the dark artwork plus 2 points of breathing room, so the last line
  // lands on sky rather than touching the flowers. Each is capped in step with
  // BAND_MAX — once the band stops growing, the clearance must stop too, or the
  // hero keeps stretching for a band that is no longer getting taller.
  //
  // `vw`, not `%`, to match the band's own unit. Percentage padding resolves
  // against the container width while the band resolves against the viewport,
  // and those differ by the scrollbar — small, but it is the safety margin
  // between the button and the dark artwork, so the two should not drift.
  const clearance = (share: number, capPx: number) =>
    `min(${(bandRatio * share * 100 + 2).toFixed(1)}vw, ${capPx}px)`

  const bandMaxPx = parseInt(BAND_MAX, 10)

  return (
    <section
      className="relative isolate overflow-hidden bg-brand-sand"
      style={
        {
          '--band-height': `min(${(bandRatio * 100).toFixed(1)}vw, ${BAND_MAX})`,
          // Named CSS variables rather than interpolated class names: Tailwind
          // only compiles class strings it can find in the source, so
          // `pb-[${computed}]` would silently produce no CSS at all.
          '--band-clearance': clearance(HILLS_SHARE_NARROW, bandMaxPx * HILLS_SHARE_NARROW + 16),
          '--band-clearance-wide': clearance(HILLS_SHARE_WIDE, bandMaxPx * HILLS_SHARE_WIDE + 16),
        } as React.CSSProperties
      }
    >
      {/*
        The band. Height comes from `vw` so it tracks the viewport width while
        the box stays a full-width strip — see BAND_MAX for why this is not
        `aspect-ratio`. A percentage height would be wrong too: it resolves
        against the section's height, not its width. The image then covers this
        box, cropping the sides.
      */}
      <div className="absolute inset-x-0 bottom-0 h-[var(--band-height)]">
        <Image
          src={image}
          alt={bannerText(alt, locale)}
          fill
          priority
          sizes="100vw"
          className="object-cover object-bottom"
        />
      </div>

      {scrimStrength > 0 && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              `linear-gradient(to bottom,` +
              ` rgb(253 250 246 / ${scrimStrength}) 0%,` +
              ` rgb(253 250 246 / ${scrimStrength * 0.85}) 45%,` +
              ` rgb(253 250 246 / 0) 85%)`,
          }}
        />
      )}

      {/* Content, centred in the sand above the band. */}
      {/*
        `pt-36` clears the fixed header, which is about 90px tall — the same
        allowance every other page makes. Less than that and the heading tucks
        underneath it at wide viewports, where the band leaves little sand above
        itself and the text sits high.
      */}
      <div className="relative flex min-h-[520px] items-center justify-center px-6 pt-36 pb-[var(--band-clearance)] md:min-h-[560px] lg:min-h-[600px] xl:pb-[var(--band-clearance-wide)]">
        <div className="max-w-2xl text-center">
          <Reveal
            as="h1"
            trigger="mount"
            y={24}
            duration={0.7}
            className="font-serif text-4xl italic leading-[1.15] text-ink-primary sm:text-5xl lg:text-6xl"
          >
            {bannerText(heading, locale)}
          </Reveal>

          <Reveal
            as="p"
            trigger="mount"
            y={16}
            delay={0.15}
            className="mx-auto mt-6 max-w-md text-base leading-relaxed text-ink-secondary"
          >
            {bannerText(subheading, locale)}
          </Reveal>

          <Reveal trigger="mount" y={12} delay={0.3} className="mt-9">
            <Link
              href={`/${locale}${ctaHref}`}
              // px-6 rather than px-9: the owner asked for a narrower button.
              // Only the horizontal padding moved — py-4 keeps the tap target
              // comfortably above the 44px minimum.
              className="inline-flex items-center justify-center rounded-full bg-ink-primary px-6 py-4 text-xs font-medium uppercase tracking-[0.18em] text-paper-white transition-colors duration-300 hover:bg-clay"
            >
              {bannerText(ctaLabel, locale)}
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
