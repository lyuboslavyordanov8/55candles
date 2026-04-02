'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

const brandValues = [
  { icon: '🌱', titleKey: 'value1Title', bodyKey: 'value1Body' },
  { icon: '🕯️', titleKey: 'value2Title', bodyKey: 'value2Body' },
  { icon: '💚', titleKey: 'value3Title', bodyKey: 'value3Body' },
] as const

function OurStoryContent() {
  const t = useTranslations('ourStory')

  return (
    <div className="relative pt-32 pb-24 bg-[#0a0a0a] text-white min-h-screen overflow-hidden">

      {/* 🔥 Ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.06),transparent_60%)]" />

      {/* HERO */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative max-w-2xl mx-auto px-6 text-center mb-28"
      >
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-white/90 mb-6">
          {t('title')}
        </h1>

        <p className="text-base text-white/60 leading-relaxed">
          {t('intro')}
        </p>
      </motion.div>

      {/* STORY BLOCK */}
      <div className="relative px-6 mb-28">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16 items-center">

          {/* Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl"
          >
            <Image
              src="/images/story.jpg"
              alt="Wax fruit on 55candles"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </motion.div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-2xl font-medium tracking-tight text-white/90 mb-5">
              {t('edibleTitle')}
            </h2>

            <p className="text-sm text-white/60 leading-relaxed">
              {t('edibleBody')}
            </p>
          </motion.div>

        </div>
      </div>

      {/* VALUES */}
      <div className="relative max-w-4xl mx-auto px-6">

        <h2 className="text-sm text-white/40 text-center mb-14 tracking-wide">
          {t('valuesTitle')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">

          {brandValues.map((v, i) => (
            <motion.div
              key={v.titleKey}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              whileHover={{ y: -4 }}
              className="group relative text-center flex flex-col items-center gap-4 p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl"
            >
              {/* subtle glow */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-500 blur-2xl bg-white/5" />

              <span className="relative text-4xl opacity-80">
                {v.icon}
              </span>

              <h3 className="relative font-medium text-base text-white/90 tracking-tight">
                {t(v.titleKey)}
              </h3>

              <p className="relative text-sm text-white/50 leading-relaxed max-w-xs">
                {t(v.bodyKey)}
              </p>
            </motion.div>
          ))}

        </div>
      </div>
    </div>
  )
}

export default function OurStoryPage() {
  return <OurStoryContent />
}