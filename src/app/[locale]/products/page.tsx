import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import ProductCard from '@/components/products/ProductCard'
import { products } from '@/data/products'
import { locales } from '@/i18n/locales'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'collection' })

  return {
    title: t('title'),
    alternates: {
      canonical: `/${locale}/products`,
      languages: Object.fromEntries(locales.map((l) => [l, `/${l}/products`])),
    },
  }
}

function ProductsContent({ locale }: { locale: string }) {
  const t = useTranslations('collection')

  const seasonalCount = products.filter(p => p.seasonal !== null).length

  return (
    <div className="pt-36 pb-24 px-6 bg-cream-base min-h-screen">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-20">
          <h1 className="font-serif text-4xl md:text-5xl font-normal text-charcoal mb-4">
            {t('title')}
          </h1>

          <p className="text-sm text-ink-ghost">
            {products.length} scents
            {seasonalCount > 0 && ` · ${seasonalCount} seasonal`}
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
          {products.map((product, i) => (
            <ProductCard
              key={product.slug}
              product={product}
              locale={locale}
              priority={i < 3}
            />
          ))}
        </div>

      </div>
    </div>
  )
}

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return <ProductsContent locale={locale} />
}
