import { useTranslations } from 'next-intl'

const sections = [
  { icon: '🕯️', titleKey: 'firstBurnTitle', bodyKey: 'firstBurnBody' },
  { icon: '✂️', titleKey: 'wickTitle', bodyKey: 'wickBody' },
  { icon: '⏱️', titleKey: 'burnTimeTitle', bodyKey: 'burnTimeBody' },
  { icon: '📦', titleKey: 'storageTitle', bodyKey: 'storageBody' },
] as const

function CandleCareContent() {
  const t = useTranslations('candleCarePage')

  return (
    <div className="pt-32 pb-24 bg-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-6 text-center mb-24">
        <h1 className="text-5xl md:text-6xl font-bold tracking-widest uppercase text-espresso mb-6">
          {t('title')}
        </h1>
        <p className="text-lg text-espresso/60 leading-relaxed">{t('subtitle')}</p>
      </div>

      <div className="max-w-3xl mx-auto px-6 flex flex-col gap-16">
        {sections.map((s) => (
          <div key={s.titleKey} className="bg-sand rounded-2xl p-10 flex gap-8 items-start">
            <span className="text-5xl shrink-0" aria-hidden="true">{s.icon}</span>
            <div>
              <h2 className="text-lg font-bold tracking-widest uppercase text-espresso mb-3">{t(s.titleKey)}</h2>
              <p className="text-base text-espresso/70 leading-relaxed">{t(s.bodyKey)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function CandleCarePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  await params
  return <CandleCareContent />
}
