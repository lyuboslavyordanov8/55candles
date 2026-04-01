import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export default function Hero({ locale }: Props) {
  const t = useTranslations('hero')
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <Image src="/images/hero.jpg" alt="55candles hero" fill priority className="object-cover" sizes="100vw" />
      <div className="absolute inset-0 bg-espresso/40" />
      <div className="relative z-10 text-center text-white px-6 max-w-3xl mx-auto">
        <h1 className="text-5xl md:text-7xl font-bold tracking-widest uppercase mb-6 leading-tight">{t('headline')}</h1>
        <p className="text-lg md:text-xl font-light tracking-wide mb-10 text-white/90 max-w-xl mx-auto">{t('subtext')}</p>
        <Link href={`/${locale}/products`} className="inline-block bg-terracotta hover:bg-amber text-white font-bold text-sm tracking-widest uppercase px-10 py-4 transition-colors duration-300">
          {t('cta')}
        </Link>
      </div>
    </section>
  )
}
