'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'

// Renders inside [locale]/layout.tsx, so the navbar, footer and the
// NextIntlClientProvider are all already in place.
export default function LocaleNotFound() {
  const t = useTranslations('notFound')
  const locale = useLocale()

  return (
    <div className="min-h-screen pt-32 pb-24 px-6 bg-cream-base flex items-start justify-center">
      <div className="max-w-xl text-center">
        <p className="text-xs tracking-[0.35em] uppercase text-ink-ghost mb-6">404</p>

        <h1 className="font-serif text-4xl md:text-5xl font-normal text-charcoal mb-4">
          {t('title')}
        </h1>

        <p className="text-base text-ink-secondary leading-relaxed mb-12">{t('body')}</p>

        <div className="flex flex-wrap items-center justify-center gap-8">
          <Link
            href={`/${locale}`}
            className="inline-flex items-center justify-center px-8 py-3 bg-charcoal text-cream-base text-xs font-medium tracking-widest uppercase rounded-sm hover:bg-clay transition-colors duration-300"
          >
            {t('cta')}
          </Link>

          <Link
            href={`/${locale}/products`}
            className="text-xs tracking-widest uppercase text-clay border-b border-clay pb-0.5 hover:opacity-70 transition-opacity duration-200"
          >
            {t('browse')} →
          </Link>
        </div>
      </div>
    </div>
  )
}
