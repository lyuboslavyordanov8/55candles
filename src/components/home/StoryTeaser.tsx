import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import Reveal from '@/components/motion/Reveal'

interface Props { locale: string }

/**
 * "Нашата история" — text left, image right, stacking to one column on mobile.
 *
 * The copy here is the owner's own introduction, written in Bulgarian. The
 * English is a translation of it; if the Bulgarian changes, the English needs
 * re-translating rather than rewriting.
 *
 * To swap the photograph: drop the new file in `public/images/`, change `src`
 * and `alt` below, and add the path to `componentImages` in
 * `src/__tests__/image-assets.test.ts` so a missing or 0-byte file fails the
 * build rather than the page.
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
          <h2 className="font-serif text-3xl font-normal italic leading-tight text-ink-primary md:text-4xl">
            {t('headline')}
          </h2>

          {/*
            Two paragraphs rather than one block. The copy is the owner's own
            introduction and runs to five sentences; as a single paragraph it
            reads as a wall beside the image.
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
          <Image
            src="/images/story.webp"
            alt={t('imageAlt')}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </Reveal>
      </div>
    </section>
  )
}
