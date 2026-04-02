'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export default function Hero({ locale }: Props) {
  const t = useTranslations('hero')
  const tNav = useTranslations('nav')

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-cream-base overflow-hidden">

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-3xl mx-auto">

        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-center gap-4 mb-8"
        >
          <span className="block w-10 h-px bg-border" />
          <span className="text-[10px] tracking-[0.35em] uppercase text-ink-ghost">
            Handcrafted in Sofia
          </span>
          <span className="block w-10 h-px bg-border" />
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="font-serif text-5xl md:text-7xl font-normal tracking-tight leading-snug mb-8 text-charcoal"
        >
          {t('headline').split(' ').slice(0, -1).join(' ')}{' '}
          <em className="text-clay">
            {t('headline').split(' ').slice(-1)[0]}
          </em>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-base md:text-lg leading-relaxed mb-12 text-ink-secondary max-w-xl mx-auto"
        >
          {t('subtext')}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
          className="flex items-center justify-center gap-8"
        >
          <Link
            href={`/${locale}/products`}
            className="inline-flex items-center justify-center px-8 py-3 bg-charcoal text-cream-base text-xs font-medium tracking-widest uppercase rounded-sm hover:bg-clay transition-colors duration-300"
          >
            {t('cta')}
          </Link>

          <Link
            href={`/${locale}/our-story`}
            className="text-xs tracking-widest uppercase text-clay border-b border-clay pb-0.5 hover:opacity-70 transition-opacity duration-200"
          >
            {tNav('ourStory')} →
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
