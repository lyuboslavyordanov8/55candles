'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export default function CtaBanner({ locale }: Props) {
  const t = useTranslations('ctaBanner')

  return (
    <section className="py-32 px-6 bg-charcoal">
      <div className="max-w-3xl mx-auto text-center">

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="font-serif text-4xl md:text-6xl font-normal leading-snug mb-6 text-cream-base"
        >
          {t('headline')}
        </motion.h2>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-base text-cream-base/55 tracking-wide mb-12"
        >
          {t('sub')}
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Link
            href={`/${locale}/products`}
            className="inline-flex items-center justify-center px-10 py-4 bg-clay text-cream-base text-sm font-medium tracking-widest uppercase rounded-sm hover:opacity-80 transition-opacity duration-200"
          >
            {t('cta')}
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
