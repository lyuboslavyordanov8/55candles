import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import Reveal from '@/components/motion/Reveal'

interface Props { locale: string }

// Server Component (AUDIT.md S-14).
export default function StoryTeaser({ locale }: Props) {
  const t = useTranslations('storyTeaser')

  return (
    <section className="py-28 px-6 bg-cream-muted">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">

        {/* Image */}
        <Reveal
          scale={0.97}
          duration={0.6}
          className="relative aspect-square rounded-sm overflow-hidden"
        >
          <Image
            src="/images/story.jpg"
            alt="Hand-sculpted wax fruit on a 55candles candle"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </Reveal>

        {/* Content */}
        <Reveal y={24} delay={0.1} className="flex flex-col gap-6">
          <h2 className="font-serif text-3xl md:text-4xl font-normal leading-snug text-charcoal">
            {t('headline')}
          </h2>

          <p className="text-base text-ink-secondary leading-relaxed max-w-md">
            {t('body')}
          </p>

          <Link
            href={`/${locale}/our-story`}
            className="inline-flex items-center gap-2 text-xs font-medium tracking-widest uppercase text-clay border-b border-clay pb-0.5 w-fit hover:opacity-70 transition-opacity duration-200"
          >
            {t('cta')} →
          </Link>
        </Reveal>
      </div>
    </section>
  )
}
