import Image from 'next/image'
import { useTranslations } from 'next-intl'

const brandValues = [
  { icon: '🌱', titleKey: 'value1Title', bodyKey: 'value1Body' },
  { icon: '🕯️', titleKey: 'value2Title', bodyKey: 'value2Body' },
  { icon: '💚', titleKey: 'value3Title', bodyKey: 'value3Body' },
] as const

function OurStoryContent() {
  const t = useTranslations('ourStory')

  return (
    <div className="pt-32 pb-24 bg-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-6 text-center mb-24">
        <h1 className="text-5xl md:text-6xl font-bold tracking-widest uppercase text-espresso mb-8">
          {t('title')}
        </h1>
        <p className="text-lg text-espresso/70 leading-relaxed">{t('intro')}</p>
      </div>

      <div className="bg-sand py-24 px-6 mb-24">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="relative aspect-square rounded-2xl overflow-hidden">
            <Image src="/images/story.jpg" alt="Wax fruit on 55candles" fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-wide text-espresso mb-6">{t('edibleTitle')}</h2>
            <p className="text-base text-espresso/70 leading-relaxed">{t('edibleBody')}</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-xs font-bold tracking-widest uppercase text-espresso/40 text-center mb-16">
          {t('valuesTitle')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {brandValues.map((v) => (
            <div key={v.titleKey} className="text-center flex flex-col items-center gap-4">
              <span className="text-5xl" aria-hidden="true">{v.icon}</span>
              <h3 className="font-bold text-lg tracking-wide text-espresso">{t(v.titleKey)}</h3>
              <p className="text-sm text-espresso/60 leading-relaxed">{t(v.bodyKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default async function OurStoryPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  await params
  return <OurStoryContent />
}
