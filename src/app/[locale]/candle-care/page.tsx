'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

const FlameIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 2c0 0-6 5.5-6 10a6 6 0 0 0 12 0c0-4.5-6-10-6-10z" />
    <path d="M12 12c0 0-2 2-2 3.5a2 2 0 0 0 4 0c0-1.5-2-3.5-2-3.5z" />
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

const BoxIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
)

const sections = [
  { Icon: FlameIcon, titleKey: 'firstBurnTitle', bodyKey: 'firstBurnBody' },
  { Icon: ScissorsIcon, titleKey: 'wickTitle', bodyKey: 'wickBody' },
  { Icon: ClockIcon, titleKey: 'burnTimeTitle', bodyKey: 'burnTimeBody' },
  { Icon: BoxIcon, titleKey: 'storageTitle', bodyKey: 'storageBody' },
] as const

function CandleCareContent() {
  const t = useTranslations('candleCarePage')

  return (
    <div className="pt-32 pb-28 bg-cream-base min-h-screen">

      {/* HEADER */}
      <div className="max-w-3xl mx-auto px-6 text-center mb-20">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-serif text-5xl md:text-6xl font-normal text-charcoal mb-6"
        >
          {t('title')}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-base text-ink-secondary leading-relaxed"
        >
          {t('subtitle')}
        </motion.p>
      </div>

      {/* SECTIONS */}
      <div className="max-w-4xl mx-auto px-6 flex flex-col gap-6">

        {sections.map((s, i) => (
          <motion.div
            key={s.titleKey}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex gap-6 items-start p-8 rounded-sm bg-cream-surface border border-border"
          >
            {/* Icon */}
            <div className="text-clay shrink-0 mt-0.5">
              <s.Icon />
            </div>

            {/* Content */}
            <div>
              <h2 className="text-sm font-medium tracking-widest uppercase text-charcoal mb-3">
                {t(s.titleKey)}
              </h2>

              <p className="text-base text-ink-secondary leading-relaxed">
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
