import Link from 'next/link'
import { useTranslations } from 'next-intl'
import Reveal from '@/components/motion/Reveal'

interface Props { locale: string }

// Server Component (AUDIT.md S-14).
export default function CtaBanner({ locale }: Props) {
  const t = useTranslations('ctaBanner')

  return (
    <section className="py-32 px-6 bg-charcoal">
      <div className="max-w-3xl mx-auto text-center">

        {/* Headline */}
        <Reveal
          as="h2"
          y={24}
          duration={0.6}
          className="font-serif text-4xl md:text-6xl font-normal leading-snug mb-6 text-cream-base"
        >
          {t('headline')}
        </Reveal>

        {/* Subtext */}
        <Reveal
          as="p"
          y={16}
          delay={0.15}
          className="text-base text-cream-base/55 tracking-wide mb-12"
        >
          {t('sub')}
        </Reveal>

        {/* CTA */}
        <Reveal y={12} delay={0.25}>
          <Link
            href={`/${locale}/products`}
            className="inline-flex items-center justify-center px-10 py-4 bg-clay text-cream-base text-sm font-medium tracking-widest uppercase rounded-sm hover:opacity-80 transition-opacity duration-200"
          >
            {t('cta')}
          </Link>
        </Reveal>
      </div>
    </section>
  )
}
