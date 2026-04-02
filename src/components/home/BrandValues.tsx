'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

const LeafIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  </svg>
)

const ShieldCheckIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
)

const SparkleIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
  </svg>
)

export default function BrandValues() {
  const t = useTranslations('values')

  const values = [
    { Icon: LeafIcon, label: t('eco') },
    { Icon: ShieldCheckIcon, label: t('nonToxic') },
    { Icon: SparkleIcon, label: t('fruit') },
  ]

  return (
    <section className="py-20 px-6 bg-cream-surface border-y border-border">
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
        {values.map((v, i) => (
          <motion.div
            key={v.label}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex flex-col items-center text-center gap-4 p-6"
          >
            <div className="text-clay transition-opacity duration-300 hover:opacity-70">
              <v.Icon />
            </div>
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-ink-secondary">
              {v.label}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
