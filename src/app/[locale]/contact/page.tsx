'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

export default function ContactPage() {
  const t = useTranslations('contact')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // TODO: Connect to Formspree or email service — replace action URL below
    setSubmitted(true)
  }

  return (
    <div className="pt-32 pb-24 bg-cream min-h-screen">
      <div className="max-w-xl mx-auto px-6">
        <h1 className="text-5xl font-bold tracking-widest uppercase text-espresso text-center mb-4">
          {t('title')}
        </h1>
        <p className="text-center text-espresso/60 mb-16">{t('subtitle')}</p>

        {submitted ? (
          <p className="text-center text-sage font-semibold tracking-wide">{t('success')}</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <input
              type="text"
              required
              placeholder={t('name')}
              className="w-full border border-espresso/20 rounded-xl px-5 py-4 text-sm bg-white text-espresso placeholder:text-espresso/30 focus:outline-none focus:border-terracotta transition-colors"
            />
            <input
              type="email"
              required
              placeholder={t('email')}
              className="w-full border border-espresso/20 rounded-xl px-5 py-4 text-sm bg-white text-espresso placeholder:text-espresso/30 focus:outline-none focus:border-terracotta transition-colors"
            />
            <textarea
              required
              rows={6}
              placeholder={t('message')}
              className="w-full border border-espresso/20 rounded-xl px-5 py-4 text-sm bg-white text-espresso placeholder:text-espresso/30 focus:outline-none focus:border-terracotta transition-colors resize-none"
            />
            <button
              type="submit"
              className="w-full bg-terracotta hover:bg-amber text-white font-bold text-sm tracking-widest uppercase py-4 rounded-xl transition-colors duration-300"
            >
              {t('send')}
            </button>
          </form>
        )}

        <div className="text-center mt-12">
          <a
            href="https://instagram.com/55candles"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="text-sm font-semibold tracking-widest uppercase text-espresso/50 hover:text-terracotta transition-colors"
          >
            {t('instagramCta')} →
          </a>
        </div>
      </div>
    </div>
  )
}
