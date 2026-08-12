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
 * ── The images are placeholders ────────────────────────────────────────────
 * There are no dedicated lifestyle photographs for this section, so the tiles
 * reuse existing product and story imagery. They work, but three of the four
 * are the same candle-on-a-surface framing, which is exactly what a section
 * like this should avoid. Replace `image` below with four purpose-shot photos
 * — a lit candle in a room, the workshop, a hand trimming a wick, a gift being
 * opened — and this section starts doing its job.
 */

interface Tile {
  /** Key under the `discover` namespace, for the overlaid label. */
  labelKey: 'scents' | 'story' | 'care' | 'contact'
  /** Path appended to the locale, e.g. `/products`. */
  href: string
  image: string
  /**
   * Object position, because these are portrait product shots being cropped
   * into a square: the default centre crop cuts the candle's lid off.
   */
  position?: string
}

const TILES: readonly Tile[] = [
  { labelKey: 'scents', href: '/products', image: '/images/products/electric-cherry.webp' },
  { labelKey: 'story', href: '/our-story', image: '/images/story.webp' },
  { labelKey: 'care', href: '/candle-care', image: '/images/products/vanilla-egg.webp' },
  { labelKey: 'contact', href: '/contact', image: '/images/products/sweet-orange.webp' },
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
