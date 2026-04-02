'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import ProductCard from '@/components/products/ProductCard'
import { products } from '@/data/products'

interface Props { locale: string }

export default function ScentsStrip({ locale }: Props) {
  const t = useTranslations('collection')

  return (
    <section className="relative py-20 px-6 bg-[#0a0a0a] text-white overflow-hidden">

      {/* 🔥 subtle glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,180,100,0.08),transparent_60%)]" />

      <div className="relative max-w-7xl mx-auto">

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 0.6, y: 0 }}
          className="text-xs font-semibold tracking-[0.3em] uppercase mb-10 text-center text-white/50"
        >
          {t('title')}
        </motion.h2>

        {/* Scroll container */}
        <div className="flex gap-6 overflow-x-auto pb-6 snap-x snap-mandatory scrollbar-none">

          {products.map((product, i) => (
            <motion.div
              key={product.slug}
              className="snap-start shrink-0 w-60"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <ProductCard product={product} locale={locale} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}