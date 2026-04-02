'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { Product } from '@/types/product'

interface Props {
  product: Product
  locale: string
}

export default function ProductCard({ product, locale }: Props) {
  const t = useTranslations('collection')

  const isOutOfSeason = product.seasonal !== null && !product.seasonal.active
  const [hoverLoaded, setHoverLoaded] = useState(false)

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="group"
    >
      {/* Card */}
      <div className="rounded-sm bg-cream-surface overflow-hidden">

        {/* IMAGE */}
        <div className="relative aspect-square overflow-hidden">

          {/* Base image */}
          <Image
            src={product.imagePath}
            alt={product.name}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 33vw"
            className={`object-cover transition duration-500 ease-out will-change-transform
              ${product.hoverImagePath && hoverLoaded
                ? 'group-hover:opacity-0 group-hover:scale-[1.04]'
                : 'group-hover:scale-[1.04]'
              }
            `}
          />

          {/* Hover image */}
          {product.hoverImagePath && (
            <Image
              src={product.hoverImagePath}
              alt={product.name}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 33vw"
              onLoad={() => setHoverLoaded(true)}
              className="object-cover opacity-0 group-hover:opacity-100 transition duration-500 ease-out will-change-opacity"
            />
          )}

          {/* Highlight badge */}
          {product.highlight && (
            <span className="absolute top-3 left-3 text-[10px] font-medium tracking-wide uppercase px-3 py-1 rounded-full bg-cream-base text-charcoal">
              {product.highlight}
            </span>
          )}

          {/* Seasonal overlay */}
          {isOutOfSeason && (
            <div className="absolute inset-0 bg-cream-base/80 flex items-center justify-center backdrop-blur-sm">
              <span className="text-ink-secondary text-xs tracking-wide uppercase">
                {t('seasonal')}
              </span>
            </div>
          )}
        </div>

        {/* CONTENT */}
        <div className="p-5 space-y-3">

          {/* Title */}
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-lg font-normal text-charcoal">
              {product.name}
            </h3>
          </div>

          {/* Descriptor */}
          <p className="text-sm text-ink-secondary leading-relaxed">
            {product.descriptor}
          </p>

          {/* Mood */}
          <p className="text-[10px] uppercase tracking-wide text-ink-ghost">
            {product.mood}
          </p>

          {/* Divider */}
          <div className="h-px w-full bg-border" />

          {/* CTA */}
          <Link
            href={`/${locale}/products/${product.slug}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium tracking-wide uppercase text-clay border-b border-clay pb-0.5 hover:opacity-70 transition-opacity duration-200"
          >
            {t('learnMore')}
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>
    </motion.div>
  )
}
