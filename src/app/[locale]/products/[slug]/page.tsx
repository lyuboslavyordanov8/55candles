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
    <div className="pt-32 pb-24 px-6 bg-cream-base min-h-screen">
      <div className="max-w-5xl mx-auto">

        {/* Back */}
        <Link
          href={`/${locale}/products`}
          className="text-xs text-ink-ghost hover:text-clay transition-colors duration-200 mb-12 inline-block tracking-widest uppercase"
        >
          ← {tNav('products')}
        </Link>

        {/* MAIN */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 mb-24">

          {/* Image */}
          <div className="relative aspect-square rounded-sm overflow-hidden border border-border bg-cream-surface">
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
            <h1 className="font-serif text-3xl md:text-4xl font-normal text-charcoal">
              {product.name}
            </h1>

            {/* Descriptor */}
            <p className="text-sm text-ink-ghost tracking-wide">
              {product.descriptor}
            </p>

            {/* Description */}
            <p className="text-base text-ink-secondary leading-relaxed">
              {product.description}
            </p>

            {/* Scent Notes */}
            <div className="pt-4 border-t border-border">
              <p className="text-xs text-ink-ghost tracking-widest uppercase mb-3">
                {t('scentNotes')}
              </p>

              <div className="text-sm text-ink-secondary space-y-1 leading-relaxed">
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
                  className="text-xs text-ink-secondary bg-cream-surface border border-border px-3 py-1 rounded-full"
                >
                  {ing}
                </span>
              ))}
            </div>

            {/* CTA */}
            <button
              disabled
              className="mt-6 w-full py-4 text-sm font-medium rounded-sm cursor-not-allowed bg-cream-muted text-ink-ghost tracking-widest uppercase"
            >
              {t('addToCart')}
            </button>
          </div>
        </div>

        {/* RELATED */}
        <div>
          <h2 className="text-xs text-ink-ghost tracking-widest uppercase text-center mb-8">
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
