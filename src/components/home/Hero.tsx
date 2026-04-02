'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export default function Hero({ locale }: Props) {
  const t = useTranslations('hero')

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-black">

      {/* Background image */}
      <Image
        src="/images/hero.jpg"
        alt="55candles hero"
        fill
        priority
        className="object-cover scale-105"
        sizes="100vw"
      />

      {/* 🔥 Dark gradient overlay (better than flat) */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />

      {/* 🔥 Warm glow layer */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,140,60,0.25),transparent_60%)]" />

      {/* 🔥 Subtle animated glow */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-30"
        style={{ background: '#f97316', top: '30%', left: '50%', translateX: '-50%' }}
        animate={{ y: [0, -30, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-3xl mx-auto">

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-5xl md:text-7xl font-semibold tracking-[0.2em] uppercase mb-6 leading-tight text-white"
        >
          {t('headline')}
        </motion.h1>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 0.85, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg md:text-xl font-light tracking-wide mb-12 text-white/80 max-w-xl mx-auto"
        >
          {t('subtext')}
        </motion.p>

        {/* CTA */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          transition={{ type: 'spring', stiffness: 250 }}
        >
          <Link
            href={`/${locale}/products`}
            className="relative inline-flex items-center justify-center px-10 py-4 rounded-full font-semibold text-sm tracking-widest uppercase overflow-hidden"
          >
            {/* Glow */}
            <span className="absolute inset-0 bg-[#f97316] blur-xl opacity-60" />

            {/* Button */}
            <span className="relative z-10 bg-[#f97316] px-10 py-4 rounded-full text-black">
              {t('cta')}
            </span>
          </Link>
        </motion.div>

      </div>
    </section>
  )
}