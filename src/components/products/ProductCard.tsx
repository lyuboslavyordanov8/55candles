import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import type { Product } from '@/types/product'

interface Props {
  product: Product
  locale: string
}

export default function ProductCard({ product, locale }: Props) {
  const t = useTranslations('collection')
  const isOutOfSeason = product.seasonal !== null && !product.seasonal.active

  return (
    <div
      className="group relative bg-white rounded-2xl overflow-hidden border-2 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
      style={{ borderColor: product.accentColor }}
    >
      <div className="relative aspect-square overflow-hidden bg-sand">
        <Image
          src={product.imagePath}
          alt={product.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 768px) 100vw, 33vw"
        />

        {isOutOfSeason && (
          <div className="absolute inset-0 bg-espresso/60 flex items-center justify-center">
            <span className="text-white text-sm font-semibold tracking-widest uppercase">
              {t('seasonal')}
            </span>
          </div>
        )}

        {product.seasonal?.active && (
          <span
            className="absolute top-3 right-3 text-white text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full"
            style={{ backgroundColor: product.accentColor }}
          >
            {t('seasonal')}
          </span>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg" aria-hidden="true">{product.emoji}</span>
          <h3 className="font-bold text-lg tracking-wide text-espresso">{product.name}</h3>
        </div>
        <p className="text-sm text-espresso/60 mb-4">{product.descriptor}</p>
        <Link
          href={`/${locale}/products/${product.slug}`}
          className="inline-block text-xs font-bold tracking-widest uppercase text-terracotta hover:text-amber transition-colors"
        >
          {t('learnMore')} →
        </Link>
      </div>
    </div>
  )
}
