'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import ProductCard from '@/components/products/ProductCard'
import { products } from '@/data/products'

interface Props { locale: string }

export default function ScentGrid({ locale }: Props) {
  const t = useTranslations('collection')

  return (
    <section className="py-28 px-6 bg-cream-base">
      <div className="max-w-7xl mx-auto">

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-serif text-3xl md:text-5xl font-normal text-charcoal mb-3">
            {t('title')}
          </h2>
          <p className="text-ink-ghost text-sm max-w-md mx-auto">
            Choose your mood. Each scent is crafted to transform your space.
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
          {products.map((product, i) => (
            <motion.div
              key={product.slug}
              initial={{ opacity: 0, y: 24 }}
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
