'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

const sections = [
  { icon: '🕯️', titleKey: 'firstBurnTitle', bodyKey: 'firstBurnBody', color: '#f59e0b' },
  { icon: '✂️', titleKey: 'wickTitle', bodyKey: 'wickBody', color: '#a78bfa' },
  { icon: '⏱️', titleKey: 'burnTimeTitle', bodyKey: 'burnTimeBody', color: '#60a5fa' },
  { icon: '📦', titleKey: 'storageTitle', bodyKey: 'storageBody', color: '#7dd3fc' },
] as const

function CandleCareContent() {
  const t = useTranslations('candleCarePage')

  return (
    <div className="relative pt-32 pb-28 bg-[#0a0a0a] text-white min-h-screen overflow-hidden">

      {/* 🔥 ambient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(255,180,100,0.12),transparent_60%)]" />

      {/* HEADER */}
      <div className="relative max-w-3xl mx-auto px-6 text-center mb-28">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl md:text-6xl font-semibold tracking-[0.2em] uppercase mb-6"
        >
          {t('title')}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 0.7, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg text-white/60 leading-relaxed"
        >
          {t('subtitle')}
        </motion.p>
      </div>

      {/* SECTIONS */}
      <div className="relative max-w-4xl mx-auto px-6 flex flex-col gap-16">

        {sections.map((s, i) => (
          <motion.div
            key={s.titleKey}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            whileHover={{ y: -6 }}
            className="group relative flex gap-6 items-start p-8 rounded-2xl bg-white/5 backdrop-blur-lg border border-white/10"
          >
            {/* 🔥 glow */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-500 blur-2xl"
              style={{ background: `${s.color}33` }}
            />

            {/* Icon */}
            <div
              className="relative text-4xl shrink-0 transition group-hover:scale-110"
              style={{ color: s.color }}
            >
              {s.icon}
            </div>

            {/* Content */}
            <div>
              <h2 className="text-sm font-semibold tracking-widest uppercase text-white/80 mb-3 group-hover:text-white transition">
                {t(s.titleKey)}
              </h2>

              <p className="text-base text-white/60 leading-relaxed">
                {t(s.bodyKey)}
              </p>
            </div>
          </motion.div>
        ))}

      </div>
    </div>
  )
}

export default function CandleCarePage() {
  return <CandleCareContent />
}