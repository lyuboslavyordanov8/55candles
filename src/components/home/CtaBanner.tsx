'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export default function CtaBanner({ locale }: Props) {
  const t = useTranslations('ctaBanner')

  return (
    <section className="relative py-32 px-6 bg-[#0a0a0a] text-white overflow-hidden">

      {/* 🔥 Ambient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,140,60,0.2),transparent_60%)]" />

      {/* 🔥 Subtle moving glow */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full blur-3xl opacity-30"
        style={{ background: '#f97316', top: '20%', left: '50%', translateX: '-50%' }}
        animate={{ y: [0, -30, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative max-w-3xl mx-auto text-center">

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-4xl md:text-6xl font-semibold tracking-[0.2em] uppercase leading-tight mb-6"
        >
          {t('headline')}
        </motion.h2>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 0.7, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-base md:text-lg text-white/60 tracking-wide mb-12"
        >
          {t('sub')}
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
            {/* 🔥 Glow layer */}
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