'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import ProductCard from '@/components/products/ProductCard'
import { products } from '@/data/products'

interface Props { locale: string }

export default function ScentGrid({ locale }: Props) {
  const t = useTranslations('collection')

  return (
    <section className="relative py-28 px-6 bg-[#0a0a0a] text-white overflow-hidden">

      {/* 🔥 Ambient glow (connects with hero) */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,180,100,0.12),transparent_60%)]" />

      <div className="relative max-w-7xl mx-auto">

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-semibold tracking-[0.2em] uppercase mb-4">
            {t('title')}
          </h2>

          {/* 🔥 subtle subtitle (optional but powerful) */}
          <p className="text-white/50 text-sm md:text-base max-w-md mx-auto">
            Choose your mood. Each scent is crafted to transform your space.
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
          {products.map((product, i) => (
            <motion.div
              key={product.slug}
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