import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import Reveal from '@/components/motion/Reveal'

/**
 * "Discover our world" — a 2x2 grid of image tiles, each a doorway into a
 * different part of the site.
 *
 * Modelled on the reference the owner supplied (oliandcarol.com), where four
 * photographs carry a label each and lead to a collection. The shape is the
 * same; the destinations are not. That site splits a large catalogue by the
 * child's age, which is a real filter for them. This catalogue is five
 * candles, so splitting it four ways would land the shopper on the same grid
 * four times. These tiles lead somewhere different instead: the scents, the
 * story, the care guide and contact.
 *
 * ── The images ─────────────────────────────────────────────────────────────
 * All four are now shot for the tile they sit in, rather than borrowing a
 * product main: the five scents together, the story photograph, the brass care
 * tools, a telephone. Each one is a different subject and a different framing,
 * which is the whole point — four variations on a candle-on-a-surface would
 * make the section decorative rather than useful.
 *
 * Every file is stored already square, matching this frame, so `object-cover`
 * neither crops nor rescales. Masters are the PNGs in `docs/`. Keep that
 * property if you replace one: see the note on `care` below for what a
 * non-square file costs here.
 */

interface Tile {
  /** Key under the `discover` namespace, for the overlaid label. */
  labelKey: 'scents' | 'story' | 'care' | 'contact'
  /** Path appended to the locale, e.g. `/products`. */
  href: string
  image: string
  /**
   * Object position, for the square frame below. Unused at present — all four
   * photographs are square or near enough that the default centre crop holds
   * the subject. It earns its keep the moment one of the placeholders is
   * swapped for a real lifestyle shot: a centre crop of a portrait photograph
   * cuts the candle's lid off, and of a landscape one loses the subject out of
   * the side.
   */
  position?: string
}

const TILES: readonly Tile[] = [
  // The collection group shot — all five scents in one frame, which is what
  // this tile promises. Shot to `docs/group-shot-brief.md`: square, with the
  // group deliberately occupying the middle ~60% of frame, so it needs no
  // `position` and must not be cropped tighter.
  {
    labelKey: 'scents',
    href: '/products',
    image: '/images/collection-group.webp',
  },
  // No `position`: the story photograph is near-square, so a centred square
  // crop already holds the whole chair. It needed `62% center` while that shot
  // was a wider landscape one.
  { labelKey: 'story', href: '/our-story', image: '/images/story-chair-closeup.webp' },
  // The care tools themselves — wick trimmer, snuffer, matches. Master is
  // `docs/ChatGPT Image Sep 18, 2026, 05_16_04 PM.png`, a 3:2 landscape; the
  // file here is already cropped square to it at 25% from the left, which keeps
  // the whole vase and every tool. Cropped in the file rather than with
  // `position` on purpose: `object-cover` fits a landscape image to this
  // frame's *height*, so a third of every downloaded byte would be thrown away
  // off the sides and the rest upscaled to cover the width. Re-crop from the
  // master in `docs/` if you want it framed differently.
  {
    labelKey: 'care',
    href: '/candle-care',
    image: '/images/care-tools.webp',
  },
  // A telephone, for "get in touch". Master is
  // `docs/ChatGPT Image Sep 18, 2026, 05_19_31 PM.png` at 1060x1024; squared
  // off centrally here, which costs 36px of width and no subject.
  {
    labelKey: 'contact',
    href: '/contact',
    image: '/images/contact-telephone.webp',
  },
]

export default function DiscoverOurWorld({ locale }: { locale: string }) {
  const t = useTranslations('discover')

  return (
    <section className="bg-paper-white px-4 py-20 md:px-6 md:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal as="h2" y={20} className="mb-10 text-center font-serif text-3xl md:mb-14 md:text-4xl">
          {t('title')}
        </Reveal>

        {/*
          Two columns at every width, matching the reference — on a phone the
          tiles are half-width rather than stacked, which keeps all four in
          view instead of turning the section into a long scroll.
        */}
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          {TILES.map((tile, i) => (
            <Reveal key={tile.labelKey} y={24} delay={i * 0.06}>
              <Link
                href={`/${locale}${tile.href}`}
                className="group relative block aspect-square overflow-hidden rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
              >
                <Image
                  src={tile.image}
                  // Empty: the visible label immediately below is the link's
                  // accessible name, so describing the photo too would make a
                  // screen reader read the tile twice.
                  alt=""
                  fill
                  // 90, not the 75 default (allow-listed in `next.config.ts`):
                  // every tile is now a detailed photograph rather than a flat
                  // product shot — five printed labels, brass tools, a dial
                  // face — and 75 smears exactly that kind of fine detail.
                  quality={90}
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  style={tile.position ? { objectPosition: tile.position } : undefined}
                />

                {/*
                  A scrim, not a tint. The labels are white over photographs
                  whose brightness we do not control — the reference has the
                  same problem and solves it the same way. Weighted to the
                  bottom, where the text sits.
                */}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-primary/70 via-ink-primary/20 to-transparent" />

                <span className="absolute inset-x-0 bottom-0 p-4 text-center font-sans text-xs font-medium uppercase tracking-[0.16em] text-paper-white md:p-5 md:text-sm">
                  {t(tile.labelKey)}
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
