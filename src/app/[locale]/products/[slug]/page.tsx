import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getProductBySlug, products } from '@/data/products'
import ProductCard from '@/components/products/ProductCard'
import type { Product } from '@/types/product'

export async function generateStaticParams() {
  const locales = ['en', 'bg']
  return locales.flatMap((locale) =>
    products.map((p) => ({ locale, slug: p.slug }))
  )
}

function ProductDetailContent({
  locale,
  product,
}: {
  locale: string
  product: Product
}) {
  const t = useTranslations('product')
  const tNav = useTranslations('nav')

  const related = products
    .filter((p) => p.slug !== product.slug)
    .slice(0, 3)

  return (
    <div className="relative pt-32 pb-24 px-6 bg-[#0a0a0a] text-white min-h-screen overflow-hidden">

      {/* 🔥 Ambient glow (SAFE now) */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20 blur-[120px]"
        style={{ background: product.glowColor }}
      />

      <div className="relative max-w-5xl mx-auto">

        {/* Back */}
        <Link
          href={`/${locale}/products`}
          className="text-xs text-white/40 hover:text-white transition-colors mb-12 inline-block"
        >
          ← {tNav('products')}
        </Link>

        {/* MAIN */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 mb-24">

          {/* Image */}
          <div className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl">
            <Image
              src={product.imagePath}
              alt={product.name}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>

          {/* Content */}
          <div className="flex flex-col justify-center gap-6">

            {/* Title */}
            <div className="flex items-center gap-3">
              <span className="text-4xl" aria-hidden="true">
                {product.emoji}
              </span>

              <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-white/90">
                {product.name}
              </h1>
            </div>

            {/* Descriptor */}
            <p className="text-sm text-white/50">
              {product.descriptor}
            </p>

            {/* Description */}
            <p className="text-base text-white/80 leading-relaxed">
              {product.description}
            </p>

            {/* Scent Notes */}
            <div className="pt-4 border-t border-white/10">
              <p className="text-xs text-white/40 mb-2">
                {t('scentNotes')}
              </p>

              <div className="text-sm text-white/70 space-y-1">
                <p>{product.scentNotes.top}</p>
                <p>{product.scentNotes.heart}</p>
                <p>{product.scentNotes.base}</p>
              </div>
            </div>

            {/* Ingredients */}
            <div className="flex flex-wrap gap-2 pt-2">
              {product.ingredients.map((ing) => (
                <span
                  key={ing}
                  className="text-xs text-white/60 bg-white/5 border border-white/10 px-3 py-1 rounded-full"
                >
                  {ing}
                </span>
              ))}
            </div>

            {/* CTA */}
            <button
              disabled
              className="mt-6 w-full py-4 text-sm font-medium rounded-xl cursor-not-allowed bg-white/10 text-white/40"
            >
              {t('addToCart')}
            </button>
          </div>
        </div>

        {/* RELATED */}
        <div>
          <h2 className="text-sm text-white/40 text-center mb-8">
            {t('relatedProducts')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {related.map((p) => (
              <ProductCard
                key={p.slug}
                product={p}
                locale={locale}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params

  const product = getProductBySlug(slug)

  if (!product) {
    notFound()
  }

  return <ProductDetailContent locale={locale} product={product} />
}