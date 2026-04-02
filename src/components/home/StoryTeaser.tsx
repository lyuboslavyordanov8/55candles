'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export default function StoryTeaser({ locale }: Props) {
  const t = useTranslations('storyTeaser')

  return (
    <section className="relative py-28 px-6 bg-[#0a0a0a] text-white overflow-hidden">

      {/* 🔥 ambient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,180,100,0.12),transparent_60%)]" />

      <div className="relative max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">

        {/* Image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7 }}
          className="relative aspect-square rounded-2xl overflow-hidden"
        >
          <Image
            src="/images/story.jpg"
            alt="55candles story"
            fill
            className="object-cover scale-105"
            sizes="(max-width: 768px) 100vw, 50vw"
          />

          {/* 🔥 gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        </motion.div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col gap-6"
        >
          {/* Headline */}
          <h2 className="text-3xl md:text-4xl font-semibold tracking-[0.1em] leading-tight">
            {t('headline')}
          </h2>

          {/* Body */}
          <p className="text-base text-white/70 leading-relaxed max-w-md">
            {t('body')}
          </p>

          {/* CTA */}
          <Link
            href={`/${locale}/our-story`}
            className="inline-flex items-center gap-2 text-sm font-semibold tracking-widest uppercase text-white/70 hover:text-white transition"
          >
            {t('cta')}

            <span className="transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </Link>
        </motion.div>
      </div>
    </section>
  )
}