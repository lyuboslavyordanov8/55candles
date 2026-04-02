'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

const LeafIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  </svg>
)

const ShieldCheckIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
)

const SparkleIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
  </svg>
)

export default function BrandValues() {
  const t = useTranslations('values')

  const values = [
    { Icon: LeafIcon, label: t('eco'), color: '#7da87b' },
    { Icon: ShieldCheckIcon, label: t('nonToxic'), color: '#7a9ab8' },
    { Icon: SparkleIcon, label: t('fruit'), color: '#f07020' },
  ]

  return (
    <section className="relative py-24 px-6 bg-[#0a0a0a] text-white overflow-hidden">

      {/* 🔥 Ambient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,180,100,0.1),transparent_60%)]" />

      <div className="relative max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">

        {values.map((v, i) => (
          <motion.div
            key={v.label}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -6 }}
            className="group relative flex flex-col items-center text-center gap-4 p-6 rounded-2xl"
          >
            {/* Glow */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-500 blur-2xl"
              style={{ background: `${v.color}33` }}
            />

            {/* Icon */}
            <div
              className="relative transition duration-300 group-hover:scale-110"
              style={{ color: v.color }}
            >
              <v.Icon />
            </div>

            {/* Label */}
            <p className="text-sm font-semibold tracking-[0.2em] uppercase text-white/70 group-hover:text-white transition">
              {v.label}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}