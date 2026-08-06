import Link from 'next/link'
import { useTranslations } from 'next-intl'
import Reveal from '@/components/motion/Reveal'

const FlameIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
)

const ScissorsIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
)

const ClockIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

const SnowflakeIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </svg>
)

interface Props { locale: string }

const tips = [
  { Icon: FlameIcon, titleKey: 'tip1Title', bodyKey: 'tip1Body' },
  { Icon: ScissorsIcon, titleKey: 'tip2Title', bodyKey: 'tip2Body' },
  { Icon: ClockIcon, titleKey: 'tip3Title', bodyKey: 'tip3Body' },
  { Icon: SnowflakeIcon, titleKey: 'tip4Title', bodyKey: 'tip4Body' },
] as const

// Server Component (AUDIT.md S-14).
export default function CandleCareTeaser({ locale }: Props) {
  const t = useTranslations('candleCareSection')

  return (
    <section className="py-28 px-6 bg-cream-base">
      <div className="max-w-7xl mx-auto">

        {/* Title */}
        <h2 className="font-serif text-3xl md:text-4xl font-normal text-center text-charcoal mb-16">
          {t('title')}
        </h2>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-14">
          {tips.map((tip, i) => (
            <Reveal
              key={tip.titleKey}
              y={24}
              delay={i * 0.08}
              className="p-6 bg-cream-surface border border-border rounded-sm text-center"
            >
              <div className="text-clay mb-3 flex justify-center">
                <tip.Icon />
              </div>

              <h3 className="text-xs font-semibold tracking-widest uppercase text-charcoal mb-2">
                {t(tip.titleKey)}
              </h3>

              <p className="text-sm text-ink-secondary leading-relaxed">
                {t(tip.bodyKey)}
              </p>
            </Reveal>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href={`/${locale}/candle-care`}
            className="inline-flex items-center gap-2 text-xs font-medium tracking-widest uppercase text-clay border-b border-clay pb-0.5 hover:opacity-70 transition-opacity duration-200"
          >
            {t('cta')} →
          </Link>
        </div>
      </div>
    </section>
  )
}
