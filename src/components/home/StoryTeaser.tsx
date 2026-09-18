import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import Reveal from '@/components/motion/Reveal'

interface Props { locale: string }

/**
 * The story section — text left, image right, stacking to one column on mobile.
 *
 * The copy here is the owner's own, written in Bulgarian. The English is a
 * translation of it; if the Bulgarian changes, the English needs re-translating
 * rather than rewriting.
 *
 * To swap the photograph: drop the new file in `public/images/`, change `src`
 * and `alt` below, and add the path to `componentImages` in
 * `src/__tests__/image-assets.test.ts` so a missing or 0-byte file fails the
 * build rather than the page.
 *
 * Give the new file a NEW NAME rather than overwriting the old one. next/image
 * keys its cache on the URL, width and quality only — never on the file's
 * contents (`hash([CACHE_VERSION, href, width, quality])` in
 * next/dist/server/image-optimizer.js) — and serves the stale render for
 * `minimumCacheTTL`, four hours by default. Reuse the name and the old
 * photograph keeps appearing: in the dev server until you delete
 * `.next/cache/images`, and for four hours in the browser of every visitor who
 * had already seen it, which no deploy can reach in to fix.
 *
 * The image comes second in the DOM so that on mobile — where the columns
 * stack — the heading and copy come first and the picture follows, rather than
 * pushing the words below the fold. `md:order-*` puts it back on the right for
 * wide viewports.
 *
 * Server Component (AUDIT.md S-14).
 */
export default function StoryTeaser({ locale }: Props) {
  const t = useTranslations('storyTeaser')

  return (
    <section className="bg-pastel-blush px-6 py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
        {/* Content */}
        <Reveal y={20} className="flex flex-col gap-5 md:order-1">
          {/*
            `whitespace-pre-line` so the newlines in the message are the line
            breaks on screen: the headline is three short sentences and reads as
            three lines. Keeping them in the copy rather than hard-coding
            `<br>`s here lets each language break where its own sentences end —
            and leaves it one translatable string rather than three.
          */}
          <h2 className="whitespace-pre-line font-serif text-3xl font-normal italic leading-tight text-ink-primary md:text-4xl">
            {t('headline')}
          </h2>

          {/*
            Two paragraphs rather than one block: as a single run of text the
            copy reads as a wall beside the image.
          */}
          <p className="max-w-md text-base leading-relaxed text-ink-secondary">
            {t('body')}
          </p>

          <p className="max-w-md text-base leading-relaxed text-ink-secondary">
            {t('body2')}
          </p>

          <Link
            href={`/${locale}/our-story`}
            className="mt-2 inline-flex w-fit items-center gap-2 border-b border-clay pb-0.5 text-xs font-medium uppercase tracking-[0.18em] text-clay transition-opacity duration-200 hover:opacity-70"
          >
            {t('cta')} <span aria-hidden>→</span>
          </Link>
        </Reveal>

        {/* Image */}
        <Reveal
          scale={0.97}
          duration={0.6}
          className="relative aspect-[4/5] overflow-hidden rounded-xl md:order-2"
        >
          {/*
            The default centre crop, deliberately: the photograph is close to
            square (1337x1177) with the chair filling it, so a centred 4:5 crop
            keeps the whole chair, the candle and the cup, and loses only the
            outer fold of the coat. An earlier, wider version of this shot
            needed `object-[62%_center]` to avoid a third of empty floor —
            re-check the framing if the photograph is replaced again.

            `quality` above the 75 default (allow-listed in `next.config.ts`):
            this is the largest photograph on the homepage after the hero, and
            at 75 the tweed weave and the candle's printed label go mushy.
          */}
          <Image
            src="/images/story-chair-closeup.webp"
            alt={t('imageAlt')}
            fill
            quality={90}
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </Reveal>
      </div>
    </section>
  )
}
