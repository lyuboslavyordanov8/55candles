'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export default function Hero({ locale }: Props) {
  const t = useTranslations('hero')
  const tNav = useTranslations('nav')

  return (
    <section className="relative h-screen min-h-[600px] overflow-hidden">

      {/* Background image */}
      <Image
        src="/images/hero.jpg"
        alt="55candles hero"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-charcoal/30 via-charcoal/50 to-charcoal/75" />

      {/* Content */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="text-center px-6 max-w-3xl mx-auto">

          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="flex items-center justify-center gap-4 mb-8"
          >
            <span className="block w-10 h-px bg-cream-base/40" />
            <span className="text-[10px] tracking-[0.35em] uppercase text-cream-base/70">
              Handcrafted in Sofia
            </span>
            <span className="block w-10 h-px bg-cream-base/40" />
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-serif text-5xl md:text-7xl font-normal tracking-tight leading-snug mb-8 text-cream-base"
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
            className="text-base md:text-lg leading-relaxed mb-12 text-cream-base/75 max-w-xl mx-auto"
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
              className="inline-flex items-center justify-center px-8 py-3 bg-cream-base text-charcoal text-xs font-medium tracking-widest uppercase rounded-sm hover:bg-clay hover:text-cream-base transition-colors duration-300"
            >
              {t('cta')}
            </Link>

            <Link
              href={`/${locale}/our-story`}
              className="text-xs tracking-widest uppercase text-cream-base/80 border-b border-cream-base/50 pb-0.5 hover:text-cream-base hover:border-cream-base transition-colors duration-200"
            >
              {tNav('ourStory')} →
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
