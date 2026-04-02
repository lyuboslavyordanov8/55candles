'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

const StarIcon = () => (
  <svg className="w-4 h-4 fill-amber text-amber" viewBox="0 0 24 24">
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
  </svg>
)

const Stars = () => (
  <div className="flex gap-0.5 opacity-80">
    {Array.from({ length: 5 }).map((_, i) => <StarIcon key={i} />)}
  </div>
)

interface Review {
  nameKey: '1name' | '2name' | '3name'
  textKey: '1text' | '2text' | '3text'
}

const reviews: Review[] = [
  { nameKey: '1name', textKey: '1text' },
  { nameKey: '2name', textKey: '2text' },
  { nameKey: '3name', textKey: '3text' },
]

export default function Testimonials() {
  const t = useTranslations('testimonials')

  return (
    <section className="relative py-28 px-6 bg-[#0a0a0a] text-white overflow-hidden">

      {/* 🔥 ambient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,180,100,0.1),transparent_60%)]" />

      <div className="relative max-w-7xl mx-auto">

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="text-3xl md:text-5xl font-semibold tracking-[0.2em] uppercase text-center mb-16"
        >
          {t('title')}
        </motion.h2>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {reviews.map((review, i) => (
            <motion.div
              key={review.nameKey}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ y: -6 }}
              className="group relative p-8 rounded-2xl bg-white/5 backdrop-blur-lg border border-white/10 flex flex-col gap-5"
            >
              {/* glow */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-500 blur-2xl bg-orange-300/20" />

              {/* stars */}
              <Stars />

              {/* text */}
              <p className="text-base text-white/70 leading-relaxed italic flex-1">
                &ldquo;{t(review.textKey)}&rdquo;
              </p>

              {/* name */}
              <p className="text-sm font-semibold tracking-wide text-white">
                {t(review.nameKey)}
                <span className="font-normal text-white/40 ml-2 tracking-normal">
                  · Verified buyer
                </span>
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}