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

function ProductDetailContent({ locale, product }: { locale: string; product: Product }) {
  const t = useTranslations('product')
  const tNav = useTranslations('nav')
  const related = products.filter((p) => p.slug !== product.slug).slice(0, 3)

  return (
    <div className="pt-32 pb-24 px-6 bg-cream min-h-screen">
      <div className="max-w-5xl mx-auto">
        <Link
          href={`/${locale}/products`}
          className="text-xs font-bold tracking-widest uppercase text-espresso/40 hover:text-terracotta transition-colors mb-12 inline-block"
        >
          ← {tNav('products')}
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 mb-24">
          <div
            className="relative aspect-square rounded-2xl overflow-hidden border-2"
            style={{ borderColor: product.accentColor }}
          >
            <Image
              src={product.imagePath}
              alt={product.name}
              fill
              priority
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>

          <div className="flex flex-col justify-center gap-6">
            <div className="flex items-center gap-3">
              <span className="text-5xl" aria-hidden="true">{product.emoji}</span>
              <h1 className="text-4xl md:text-5xl font-bold tracking-widest uppercase text-espresso">
                {product.name}
              </h1>
            </div>
            <p className="text-sm text-espresso/50 tracking-wide">{product.descriptor}</p>
            <p className="text-base text-espresso/80 leading-relaxed">{product.description}</p>

            <div>
              <h2 className="text-xs font-bold tracking-widest uppercase text-espresso/40 mb-3">
                {t('scentNotes')}
              </h2>
              <div className="flex flex-col gap-1 text-sm text-espresso/70">
                <p><span className="font-semibold">{t('top')}:</span> {product.scentNotes.top}</p>
                <p><span className="font-semibold">{t('heart')}:</span> {product.scentNotes.heart}</p>
                <p><span className="font-semibold">{t('base')}:</span> {product.scentNotes.base}</p>
              </div>
            </div>

            <div>
              <h2 className="text-xs font-bold tracking-widest uppercase text-espresso/40 mb-3">
                {t('ingredients')}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {product.ingredients.map((ing) => (
                  <li key={ing} className="text-xs font-semibold tracking-wide bg-sand px-3 py-1 rounded-full text-espresso/70">
                    {ing}
                  </li>
                ))}
              </ul>
            </div>

            <button
              disabled
              className="mt-4 w-full py-4 bg-espresso/10 text-espresso/30 font-bold text-sm tracking-widest uppercase rounded cursor-not-allowed"
            >
              {t('addToCart')}
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-bold tracking-widest uppercase text-espresso/40 mb-8 text-center">
            {t('relatedProducts')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {related.map((p) => (
              <ProductCard key={p.slug} product={p} locale={locale} />
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
    return null
  }

  return <ProductDetailContent locale={locale} product={product} />
}
