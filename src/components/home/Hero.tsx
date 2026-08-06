import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import Reveal from '@/components/motion/Reveal'

interface Props { locale: string }

/**
 * Splits a headline so the last word can be italicised.
 *
 * Guards the empty/single-word cases, which the previous inline
 * `.split(' ').slice(0, -1)` did not — a one-word translation rendered an
 * empty lead and BG punctuation still lands inside the <em> (AUDIT.md N-08,
 * still open: the fix is a translator-controlled markup key, not more string
 * surgery).
 */
function splitLastWord(headline: string): [string, string] {
  const words = headline.trim().split(/\s+/)
  if (words.length < 2) return ['', headline]
  return [words.slice(0, -1).join(' '), words[words.length - 1]]
}

// Server Component: the hero image, headline and CTAs are static. Only the
// entrance animations cross to the client, via Reveal (AUDIT.md S-14).
export default function Hero({ locale }: Props) {
  const t = useTranslations('hero')
  const tNav = useTranslations('nav')

  const [lead, lastWord] = splitLastWord(t('headline'))

  return (
    <section className="relative h-screen min-h-[600px] overflow-hidden">

      {/* Background image — the LCP element, hence priority */}
      <Image
        src="/images/hero.jpg"
        alt="A lit 55candles candle topped with hand-sculpted wax fruit"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-charcoal/30 via-charcoal/50 to-charcoal/75" />

      {/* Content */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="text-center px-6 max-w-3xl mx-auto">

          {/* Eyebrow */}
          <Reveal
            trigger="mount"
            duration={0.6}
            className="flex items-center justify-center gap-4 mb-8"
          >
            <span className="block w-10 h-px bg-cream-base/40" />
            <span className="text-[10px] tracking-[0.35em] uppercase text-cream-base/70">
              Handcrafted in Sofia
            </span>
            <span className="block w-10 h-px bg-cream-base/40" />
          </Reveal>

          {/* Headline */}
          <Reveal
            as="h1"
            trigger="mount"
            y={30}
            duration={0.7}
            delay={0.1}
            className="font-serif text-5xl md:text-7xl font-normal tracking-tight leading-snug mb-8 text-cream-base"
          >
            {lead && `${lead} `}
            <em className="text-clay">{lastWord}</em>
          </Reveal>

          {/* Subtext */}
          <Reveal
            as="p"
            trigger="mount"
            y={16}
            delay={0.25}
            className="text-base md:text-lg leading-relaxed mb-12 text-cream-base/75 max-w-xl mx-auto"
          >
            {t('subtext')}
          </Reveal>

          {/* CTAs */}
          <Reveal
            trigger="mount"
            y={12}
            delay={0.38}
            className="flex items-center justify-center gap-8"
          >
            <Link
              href={`/${locale}/products`}
              className="inline-flex items-center justify-center px-8 py-3 bg-cream-base text-charcoal text-xs font-medium tracking-widest uppercase rounded-sm hover:bg-clay hover:text-cream-base transition-colors duration-300"
            >
              {t('cta')}
            </Link>

            <Link
              href={`/${locale}/our-story`}
              className="text-xs tracking-widest uppercase text-cream-base/80 border-b border-cream-base/50 pb-0.5 hover:text-cream-base hover:border-cream-base transition-colors duration-200"
            >
              {tNav('ourStory')} →
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
