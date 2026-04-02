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
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 180, damping: 20 }}
      className="group relative rounded-2xl"
    >
      {/* ✨ Subtle ambient glow (NOT loud anymore) */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-60 transition duration-700 blur-3xl"
        style={{
          background: product.glowColor || product.accentColor,
        }}
      />

      {/* Card */}
      <div className="relative rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 overflow-hidden shadow-[0_8px_25px_rgba(0,0,0,0.25)] group-hover:shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition-all duration-500">

        {/* IMAGE */}
        <div className="relative aspect-square overflow-hidden">

          {/* Base image */}
          <Image
            src={product.imagePath}
            alt={product.name}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 33vw"
            className={`object-cover transition duration-700 ease-out will-change-transform will-change-opacity
              ${product.hoverImagePath && hoverLoaded
                ? 'group-hover:opacity-20 scale-[1.04]'
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
              className="object-cover opacity-0 group-hover:opacity-100 transition duration-700 ease-out will-change-opacity"
            />
          )}

          {/* Softer gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-transparent" />

          {/* Highlight */}
          {product.highlight && (
            <span className="absolute top-3 left-3 text-[10px] font-medium tracking-wide uppercase px-3 py-1 rounded-full bg-white/90 text-black">
              {product.highlight}
            </span>
          )}

          {/* Seasonal */}
          {isOutOfSeason && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
              <span className="text-white/80 text-xs tracking-wide uppercase">
                {t('seasonal')}
              </span>
            </div>
          )}
        </div>

        {/* CONTENT */}
        <div className="p-5 space-y-3">

          {/* Title */}
          <div className="flex items-center gap-2">
            <motion.span
              className="text-base"
              whileHover={{ scale: 1.15 }}
              transition={{ type: 'spring', stiffness: 260 }}
            >
              {product.emoji}
            </motion.span>

            <h3 className="text-base font-medium tracking-tight text-white/90">
              {product.name}
            </h3>
          </div>

          {/* Descriptor */}
          <p className="text-sm text-white/55 leading-relaxed">
            {product.descriptor}
          </p>

          {/* Mood */}
          <p className="text-[10px] uppercase tracking-wide text-white/35">
            {product.mood}
          </p>

          {/* Divider */}
          <div
            className="h-px w-full opacity-30"
            style={{ background: product.accentColor }}
          />

          {/* CTA */}
          <Link
            href={`/${locale}/products/${product.slug}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium tracking-wide uppercase transition-colors duration-300"
            style={{ color: product.accentColor }}
          >
            {t('learnMore')}

            <span className="transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </div>
    </motion.div>
  )
}