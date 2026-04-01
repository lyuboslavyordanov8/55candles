import Link from 'next/link'
import { useTranslations } from 'next-intl'

const FlameIcon = () => (
  <svg className="w-7 h-7 text-terracotta" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
)

const ScissorsIcon = () => (
  <svg className="w-7 h-7 text-terracotta" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
)

const ClockIcon = () => (
  <svg className="w-7 h-7 text-terracotta" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

const SnowflakeIcon = () => (
  <svg className="w-7 h-7 text-terracotta" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M20 16l-4-4 4-4" />
    <path d="M4 8l4 4-4 4" />
    <path d="M16 4l-4 4-4-4" />
    <path d="M8 20l4-4 4 4" />
  </svg>
)

interface Props { locale: string }

const tips = [
  { Icon: FlameIcon, titleKey: 'tip1Title', bodyKey: 'tip1Body' },
  { Icon: ScissorsIcon, titleKey: 'tip2Title', bodyKey: 'tip2Body' },
  { Icon: ClockIcon, titleKey: 'tip3Title', bodyKey: 'tip3Body' },
  { Icon: SnowflakeIcon, titleKey: 'tip4Title', bodyKey: 'tip4Body' },
] as const

export default function CandleCareTeaser({ locale }: Props) {
  const t = useTranslations('candleCareSection')
  return (
    <section className="py-24 px-6 bg-sand">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold tracking-widest uppercase text-espresso text-center mb-16">{t('title')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {tips.map((tip) => (
            <div key={tip.titleKey} className="bg-white rounded-2xl p-6 flex flex-col items-center text-center gap-3 shadow-sm">
              <tip.Icon />
              <h3 className="font-bold text-sm tracking-widest uppercase text-espresso">{t(tip.titleKey)}</h3>
              <p className="text-sm text-espresso/60 leading-relaxed">{t(tip.bodyKey)}</p>
            </div>
          ))}
        </div>
        <div className="text-center">
          <Link
            href={`/${locale}/candle-care`}
            className="inline-block text-sm font-bold tracking-widest uppercase text-terracotta hover:text-amber transition-colors duration-200 cursor-pointer"
          >
            {t('cta')} →
          </Link>
        </div>
      </div>
    </section>
  )
}
