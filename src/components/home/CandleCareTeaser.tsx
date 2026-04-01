import Link from 'next/link'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

const tips = [
  { icon: '🕯️', titleKey: 'tip1Title', bodyKey: 'tip1Body' },
  { icon: '✂️', titleKey: 'tip2Title', bodyKey: 'tip2Body' },
  { icon: '⏱️', titleKey: 'tip3Title', bodyKey: 'tip3Body' },
  { icon: '🌡️', titleKey: 'tip4Title', bodyKey: 'tip4Body' },
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
              <span className="text-4xl" aria-hidden="true">{tip.icon}</span>
              <h3 className="font-bold text-sm tracking-widest uppercase text-espresso">{t(tip.titleKey)}</h3>
              <p className="text-sm text-espresso/60 leading-relaxed">{t(tip.bodyKey)}</p>
            </div>
          ))}
        </div>
        <div className="text-center">
          <Link href={`/${locale}/candle-care`} className="inline-block text-sm font-bold tracking-widest uppercase text-terracotta hover:text-amber transition-colors">
            {t('cta')} →
          </Link>
        </div>
      </div>
    </section>
  )
}
