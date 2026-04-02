'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export default function StoryTeaser({ locale }: Props) {
  const t = useTranslations('storyTeaser')

  return (
    <section className="py-28 px-6 bg-cream-muted">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">

        {/* Image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="relative aspect-square rounded-sm overflow-hidden"
        >
          <Image
            src="/images/story.jpg"
            alt="55candles story"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </motion.div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col gap-6"
        >
          <h2 className="font-serif text-3xl md:text-4xl font-normal leading-snug text-charcoal">
            {t('headline')}
          </h2>

          <p className="text-base text-ink-secondary leading-relaxed max-w-md">
            {t('body')}
          </p>

          <Link
            href={`/${locale}/our-story`}
            className="inline-flex items-center gap-2 text-xs font-medium tracking-widest uppercase text-clay border-b border-clay pb-0.5 w-fit hover:opacity-70 transition-opacity duration-200"
          >
            {t('cta')} →
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
