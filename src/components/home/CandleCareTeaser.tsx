'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

const FlameIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
)

const ScissorsIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
)

const ClockIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

const SnowflakeIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </svg>
)

interface Props { locale: string }

const tips = [
  { Icon: FlameIcon, titleKey: 'tip1Title', bodyKey: 'tip1Body', color: '#f59e0b' },
  { Icon: ScissorsIcon, titleKey: 'tip2Title', bodyKey: 'tip2Body', color: '#a78bfa' },
  { Icon: ClockIcon, titleKey: 'tip3Title', bodyKey: 'tip3Body', color: '#60a5fa' },
  { Icon: SnowflakeIcon, titleKey: 'tip4Title', bodyKey: 'tip4Body', color: '#7dd3fc' },
] as const

export default function CandleCareTeaser({ locale }: Props) {
  const t = useTranslations('candleCareSection')

  return (
    <section className="relative py-28 px-6 bg-[#0a0a0a] text-white overflow-hidden">

      {/* 🔥 ambient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(255,180,100,0.1),transparent_60%)]" />

      <div className="relative max-w-7xl mx-auto">

        {/* Title */}
        <h2 className="text-3xl md:text-4xl font-semibold tracking-[0.2em] uppercase text-center mb-16">
          {t('title')}
        </h2>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-14">
          {tips.map((tip, i) => (
            <motion.div
              key={tip.titleKey}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ y: -6 }}
              className="group relative p-6 rounded-2xl bg-white/5 backdrop-blur-lg border border-white/10 text-center"
            >
              {/* glow */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-500 blur-2xl"
                style={{ background: `${tip.color}33` }}
              />

              {/* icon */}
              <div
                className="relative mb-3 transition group-hover:scale-110"
                style={{ color: tip.color }}
              >
                <tip.Icon />
              </div>

              {/* title */}
              <h3 className="text-sm font-semibold tracking-widest uppercase text-white/80 group-hover:text-white transition">
                {t(tip.titleKey)}
              </h3>

              {/* body */}
              <p className="text-sm text-white/50 leading-relaxed mt-2">
                {t(tip.bodyKey)}
              </p>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href={`/${locale}/candle-care`}
            className="inline-flex items-center gap-2 text-sm font-semibold tracking-widest uppercase transition"
          >
            <span className="text-white/70 hover:text-white transition">
              {t('cta')}
            </span>
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}