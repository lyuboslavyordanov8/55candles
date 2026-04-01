import { useTranslations } from 'next-intl'
import ProductCard from '@/components/products/ProductCard'
import { products } from '@/data/products'

function ProductsContent({ locale }: { locale: string }) {
  const t = useTranslations('collection')
  return (
    <div className="pt-32 pb-24 px-6 bg-cream min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold tracking-widest uppercase text-espresso text-center mb-4">
          {t('title')}
        </h1>
        <p className="text-center text-espresso/50 text-sm tracking-wide mb-16">
          6 scents · 1 seasonal
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((product) => (
            <ProductCard key={product.slug} product={product} locale={locale} />
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
