import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import ProductImagePair from './ProductImagePair'
import type { Product } from '@/types/product'

interface Props {
  product: Product
  locale: string
  /**
   * Preload this card's image. Only set it for cards above the fold — the
   * first row of a grid — otherwise `priority` defeats lazy loading and
   * delays the real LCP element.
   */
  priority?: boolean
}

// Server Component. The card was previously wrapped in `motion.div` purely for
// a 4px hover lift, which pulled framer-motion and the whole card into the
// client bundle on every grid render. The lift is now a CSS transform — and
// the reduced-motion block in globals.css caps its duration, which the
// framer-motion version needed MotionConfig to achieve (AUDIT.md S-14).
export default function ProductCard({ product, locale, priority = false }: Props) {
  const t = useTranslations('collection')

  const isOutOfSeason = product.seasonal !== null && !product.seasonal.active

  return (
    <div className="group transition-transform duration-200 ease-out hover:-translate-y-1">
      {/* Card */}
      <div className="rounded-sm bg-cream-surface overflow-hidden">

        {/* IMAGE */}
        <div className="relative aspect-square overflow-hidden">
          {product.hoverImagePath ? (
            <ProductImagePair
              src={product.imagePath}
              hoverSrc={product.hoverImagePath}
              alt={product.name}
              priority={priority}
            />
          ) : (
            <Image
              src={product.imagePath}
              alt={product.name}
              fill
              priority={priority}
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition duration-500 ease-out will-change-transform group-hover:scale-[1.04]"
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
    </div>
  )
}
