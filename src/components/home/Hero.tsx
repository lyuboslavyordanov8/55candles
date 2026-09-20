import Link from 'next/link'
import Image from 'next/image'
import Reveal from '@/components/motion/Reveal'
import { homeBanner, bannerText } from '@/content/home-banner'

interface Props { locale: string }

/**
 * The hero's height once the photograph fills it.
 *
 * Kept deliberately short — the owner asked for a band the size of the hero this
 * replaced, which was 520px, so that is the floor. A full-bleed 3:2 photograph in
 * a band that shallow shows only part of its height: 624 of the source's 1024
 * rows at 1280px, 522 from 1536px up, 486 at 2400px, 304 at 3840px. Showing the
 * whole picture edge to edge at 1280px would take an 853px band, which is the
 * height that was rejected as too tall.
 *
 * So the height is not a free choice: the crop window has to hold the candles, and
 * the rows it converts to shrink as the viewport widens. `34vw` is the shallowest
 * slope that keeps them in frame above 1536px; below that the 520px floor carries
 * it. Measured results per width are in the anchor note below. The band also has to
 * be deep enough to hold the words with air around them — at 1280px they are 252px
 * of the 520px, which is the tightest it gets.
 *
 * The ceiling stops a zoomed-out browser reporting several thousand pixels of
 * width from asking for a hero taller than any screen. It has a side effect worth
 * knowing: above roughly 2235px the band stops growing while the crop keeps
 * tightening, so the band's mid-height — where the words sit — slides down the
 * picture onto the cushion. That is the 2560px contrast cliff in the note below the
 * next constant.
 */
const HERO_HEIGHT = 'xl:min-h-[clamp(520px,34vw,760px)]'

/**
 * How far down the photograph is anchored inside that band, as
 * `object-position`, in three viewport bands.
 *
 * **Measured, not chosen by eye.** A 3:2 photograph stretched edge to edge is
 * always *width*-driven in a band this shallow: the whole width shows and only
 * rows survive (the counts are in HERO_HEIGHT above). What has to fit in those
 * rows is the tins, at source y 500–830.
 *
 * Measured share of the three tins' rows kept: 100% from 1280px to 2560px, with
 * two dips — 99.8% around 1400px and 98% around 2500px, both the front tin's
 * lower rim, never a label. Beyond that the window is simply too shallow to hold
 * all three: 96% at 3200px, 92% at 3840px.
 *
 * These three values come from the earlier layout that put the words on the picture's
 * bright top-left corner, where each one was the lowest crop whose subheading still
 * cleared the dark cushion — which is why they are stepped rather than one number,
 * and why the step lands at 1440px, the width where the Bulgarian heading stopped
 * wrapping to a third line. Left as they are because this is the framing the owner
 * signed off on.
 *
 * With the words back on the left of the bare photograph, this constant is again one
 * of the two levers over their legibility (the other is the band's height): it decides
 * what ends up underneath them. Whatever you change it to, re-measure — the note above
 * the component has the numbers this crop produces and how they were taken.
 *
 * The bands are spelled as explicit `min-[…px]` variants, including the one that
 * duplicates `xl`, so Tailwind emits them in ascending order regardless of how
 * arbitrary variants sort against named breakpoints — the built CSS was checked
 * for that order.
 */
const PHOTO_ANCHOR =
  'object-cover min-[1280px]:object-[50%_57%] min-[1440px]:object-[50%_63%] min-[2560px]:object-[50%_67%]'

/**
 * The hero: the photograph edge to edge, the words on its left at mid-height.
 *
 * **There is no content in this file.** The image, all four strings and the
 * link target come from `src/content/home-banner.ts` — edit that to change the
 * banner; this file only decides how it is arranged. That separation is the
 * whole point: swapping the banner should never mean reading layout code.
 *
 * ── Nothing sits behind the words, and that is deliberate ──────────────────
 * The owner asked for the words on the left of the banner at mid-height, with
 * nothing at all behind them — no panel, no veil, no glow. This is that. Legibility
 * is therefore a property of the *photograph*, not of this file, and it is why the
 * left gutter, the block's width and the heading's size below are all measured
 * against the picture rather than chosen typographically.
 *
 * What the picture offers is a pale curtain down its left side; what it does not
 * offer is anywhere for text in the lower left, where a pink cushion and a striped
 * cloth sit. Mid-height on the left is the boundary between the two, so the numbers
 * are good and not perfect. Measured on the rendered page at ten widths from 1280px
 * to 3840px, sampling the real photograph under the **glyphs themselves** (a mask of
 * the pixels the text changes, so the empty space inside a text box cannot flatter
 * the result). Re-measure after any change to the two type sizes below — going from
 * 40/16px to 44/18px moved the subheading's worst band from 3.9% to 9.3%:
 *
 *                       1280–2048px                    2560–3840px
 *   heading    clears 3:1 everywhere          0.1% of glyph pixels under at
 *                                             3200px, 2.3% at 3840px
 *   subheading 0.1–9.3% of glyph pixels       36–44% under — it lands on the
 *              under 4.5:1: its second        cushion outright and is not
 *              line running onto the          readable there
 *              cushion, worst at 1536px
 *
 * The 2560px cliff is the band's height, not the anchor: from about 2235px up the
 * band stops growing at its 760px ceiling while the crop keeps tightening, so the
 * band's mid-height lands squarely on the cushion. The words would need to sit at
 * roughly 40% of the band rather than 50% to clear it — a deliberate deviation from
 * "at the middle", so it is not done here. Raising PHOTO_ANCHOR at those widths
 * would work too and costs tin rows. The button never cares: it is solid ink with
 * its own background.
 *
 * Three treatments have been built and rejected here. Knowing which is which saves
 * rebuilding one:
 *
 *  • **a veil over the whole photograph** — a flat cream scrim measured 1.0–3.2:1
 *    and a radial fade 1.54:1; anything strong enough to work erased the picture;
 *  • **a panel under the words** — a rounded `brand-sand` card at 88% over a blur
 *    measured a flat 8.2:1 at every width, and was rejected on sight for looking
 *    like a dialog box dropped on the banner. Contrast was never its problem;
 *  • **an edgeless bloom** — one soft radial gradient of sand at 78%, no border
 *    anywhere, measured 6.0–7.1:1 with nothing under threshold. Rejected too: the
 *    haze over the middle of the picture was visible and unwanted.
 *
 * Ask before trying a fourth. The remaining levers that do not put anything on the
 * photograph are: shorter copy (fewer glyphs reaching into the cushion), the crop in
 * PHOTO_ANCHOR, and the photograph itself — `src/content/home-banner.ts` states what
 * a new one has to give the words.
 *
 * ── Below 1280px the words move off the picture ────────────────────────────
 * Below `xl` there is no room to lay words over the photograph at all, so the hero
 * stacks instead — which is also the one place its text is reliably legible: the
 * photograph whole at its own 3:2,
 * nothing cropped, and the words below it on flat `brand-sand` where contrast is a
 * property of two colour tokens (11.5:1 and 5.8:1). The ratio comes from
 * `imageWidth`/`imageHeight` via a CSS variable, so a differently shaped photo
 * needs no change here.
 *
 * ── Height ─────────────────────────────────────────────────────────────────
 * See HERO_HEIGHT above.
 *
 * The header is `fixed` and opaque, so the photograph starts directly below it —
 * `102px`, `120px` from `md` up, which is what `Navbar` measures (announcement
 * bar plus a `py-5 md:py-6` row around an `h-4 md:h-5` logo). Other pages clear
 * it with `pt-36` and let the slack be whitespace; here the slack would be a
 * sand stripe across the top of a full-bleed picture. The exact number is the
 * one coupling to another component in this file: if the header ever grows, its
 * opaque white bar covers the first rows of the photograph, which is ugly but
 * harmless — the words are centred in the band, nowhere near its top edge.
 *
 * The photograph deliberately does not run *under* the header: pixels behind an
 * opaque white bar are pixels the visitor paid for and cannot see.
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
  } = homeBanner

  return (
    <section
      className="relative isolate bg-brand-sand pt-[102px] md:pt-[120px]"
      style={
        {
          // A named CSS variable rather than an interpolated class name:
          // Tailwind only compiles class strings it can find in the source, so
          // `aspect-[${imageWidth}/${imageHeight}]` would produce no CSS at all.
          '--photo-ratio': `${imageWidth} / ${imageHeight}`,
        } as React.CSSProperties
      }
    >
      {/*
        The frame. At xl+ its min-height is the hero's height and the photograph
        fills it absolutely; below xl it has no height of its own and simply
        stacks the photograph above the words.
      */}
      <div className={`relative ${HERO_HEIGHT}`}>
        {/*
          The photograph. Its own ratio while stacked — so a phone sees the whole
          picture — then absolutely filling the frame from xl up.

          `sizes="100vw"` because it is edge to edge at every width; that makes
          it the largest image the site ever requests, which is why `priority`
          (it is the LCP element) and `quality={90}`, the higher of the two values
          `next.config.ts` allows — a photograph of a dim room bands visibly
          at 75.
        */}
        <div className="relative aspect-[var(--photo-ratio)] w-full xl:absolute xl:inset-0 xl:aspect-auto">
          <Image
            src={image}
            alt={bannerText(alt, locale)}
            fill
            priority
            quality={90}
            sizes="100vw"
            className={PHOTO_ANCHOR}
          />
        </div>

        {/*
          The words. Stacked below the photograph on a real sand panel until xl;
          from xl up they are an overlay centred on the picture, both axes, laid
          straight on the photograph with nothing between (see the note above the
          component for what that costs).

          The overlay is `absolute inset-0` plus `flex items-center justify-center`
          rather than a transform: the block's own height then decides where its
          centre lands, so a reworded banner that wraps to another line stays
          centred instead of drifting down.

          The vertical paddings are spelled out per side rather than as `py`:
          Tailwind emits `p-*` before `px-*` before `pt-*`, so a bare `xl:p-10`
          would lose to the `px-6`/`pb-14` above it — same variant weight, and the
          base utility wins on source order.

          The horizontal gutter is the opposite case, and it is why these steps are
          `px-*` and not the `pl-*` they look like they want to be: `padding-left`
          is emitted *before* `padding-inline` in the built sheet, so an
          `xl:pl-16` loses to the `sm:px-10` above it and the words sat 40px from
          the edge instead of 64px. Measured in the browser, not assumed. Keeping
          the same property at every step makes the cascade plain breakpoint order;
          the right half of the value is inert, since the block is left-aligned.

          The gutter grows with the viewport so the words do not drift into a
          corner on a wide monitor, and the steps are spelled as arbitrary
          `min-[…px]` variants — including the one that duplicates `xl` — so they
          sort ascending regardless of how arbitrary variants rank against named
          breakpoints.
        */}
        <div className="relative px-6 pt-10 pb-14 text-center sm:px-10 xl:absolute xl:inset-0 xl:flex xl:items-center xl:justify-start xl:pt-10 xl:pb-10 xl:text-left min-[1280px]:px-16 min-[1920px]:px-24 min-[2560px]:px-32">
          {/*
            `max-w-md` (448px) is a contrast constraint, not a typographic one. With
            the words on the left of the bare photograph, the width of this block is
            how far right they reach — and the picture's clean pale strip runs out at
            roughly x 400 at 1280px, where a dark vase and chair back begin. 448px
            plus the 64px gutter lands the longest line just inside that. Widen it
            and the ends of the lines walk onto the dark furniture.
          */}
          <div className="mx-auto max-w-lg xl:mx-0 xl:max-w-md">
            <Reveal
              as="h1"
              trigger="mount"
              y={24}
              duration={0.7}
              // 44px at xl rather than the 48px it gets on a phone's own sand
              // panel: in this column 48px italic wraps the Bulgarian heading to
              // four lines, and the fourth reaches below the pale strip.
              className="font-serif text-4xl italic leading-[1.15] text-ink-primary sm:text-5xl xl:text-[2.75rem]"
            >
              {bannerText(heading, locale)}
            </Reveal>

            <Reveal
              as="p"
              trigger="mount"
              y={16}
              delay={0.15}
              // 18px at xl, up from 16px. It does not change what the subheading
              // needs from the photograph: WCAG's easier 3:1 "large text" rule
              // starts at 24px regular, so this is still 4.5:1 text.
              className="mx-auto mt-6 max-w-md text-base leading-relaxed text-ink-secondary xl:mx-0 xl:max-w-sm xl:text-lg xl:text-ink-primary"
            >
              {bannerText(subheading, locale)}
            </Reveal>

            <Reveal trigger="mount" y={12} delay={0.3} className="mt-9">
              <Link
                href={`/${locale}${ctaHref}`}
                // px-6 rather than px-9: the owner asked for a narrower button.
                // Only the horizontal padding moved — py-4 keeps the tap target
                // comfortably above the 44px minimum. Solid ink on white text, so
                // unlike the text above it this needs nothing from the photo.
                className="inline-flex items-center justify-center rounded-full bg-ink-primary px-6 py-4 text-xs font-medium uppercase tracking-[0.18em] text-paper-white transition-colors duration-300 hover:bg-clay"
              >
                {bannerText(ctaLabel, locale)}
              </Link>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
