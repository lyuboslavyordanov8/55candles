import Link from 'next/link'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export default function CtaBanner({ locale }: Props) {
  const t = useTranslations('ctaBanner')
  return (
    <section className="py-24 px-6 bg-espresso">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-4xl md:text-5xl font-bold tracking-widest uppercase text-cream leading-tight mb-5">
          {t('headline')}
        </h2>
        <p className="text-base text-cream/60 tracking-wide mb-10">
          {t('sub')}
        </p>
        <Link
          href={`/${locale}/products`}
          className="inline-block bg-terracotta hover:bg-amber text-white font-bold text-sm tracking-widest uppercase px-10 py-4 transition-colors duration-300 cursor-pointer"
        >
          {t('cta')}
        </Link>
      </div>
    </section>
  )
}
