'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'

// Error boundaries must be Client Components. Next 16 passes `unstable_retry`
// (not `reset`) to re-render the boundary's children.
export default function LocaleError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  const t = useTranslations('error')
  const locale = useLocale()

  useEffect(() => {
    // TODO(AUDIT.md S-15): forward to an error monitor once one is wired up.
    // `error.digest` is the handle for matching this against server logs —
    // production errors from Server Components carry no message.
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen pt-32 pb-24 px-6 bg-cream-base flex items-start justify-center">
      <div className="max-w-xl text-center">
        <h1 className="font-serif text-4xl md:text-5xl font-normal text-charcoal mb-4">
          {t('title')}
        </h1>

        <p className="text-base text-ink-secondary leading-relaxed mb-12">{t('body')}</p>

        <div className="flex flex-wrap items-center justify-center gap-8">
          <button
            onClick={() => unstable_retry()}
            className="inline-flex items-center justify-center px-8 py-3 bg-charcoal text-cream-base text-xs font-medium tracking-widest uppercase rounded-sm hover:bg-clay transition-colors duration-300"
          >
            {t('retry')}
          </button>

          <Link
            href={`/${locale}`}
            className="text-xs tracking-widest uppercase text-clay border-b border-clay pb-0.5 hover:opacity-70 transition-opacity duration-200"
          >
            {t('home')} →
          </Link>
        </div>

        {error.digest && (
          <p className="mt-12 text-[10px] tracking-widest uppercase text-ink-ghost">
            Ref: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
