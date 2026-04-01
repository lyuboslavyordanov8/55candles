import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export default function StoryTeaser({ locale }: Props) {
  const t = useTranslations('storyTeaser')
  return (
    <section className="py-24 px-6 bg-sand">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="relative aspect-square rounded-2xl overflow-hidden">
          <Image src="/images/story.jpg" alt="55candles story" fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
        </div>
        <div className="flex flex-col gap-6">
          <h2 className="text-3xl md:text-4xl font-bold tracking-wide text-espresso leading-tight">{t('headline')}</h2>
          <p className="text-base text-espresso/70 leading-relaxed max-w-md">{t('body')}</p>
          <Link href={`/${locale}/our-story`} className="inline-block text-sm font-bold tracking-widest uppercase text-terracotta hover:text-amber transition-colors duration-200 cursor-pointer">
            {t('cta')} →
          </Link>
        </div>
      </div>
    </section>
  )
}
