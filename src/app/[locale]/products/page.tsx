import { useTranslations } from 'next-intl'
import ProductCard from '@/components/products/ProductCard'
import { products } from '@/data/products'

function ProductsContent({ locale }: { locale: string }) {
  const t = useTranslations('collection')

  const seasonalCount = products.filter(p => p.seasonal !== null).length

  return (
    <div className="relative pt-32 pb-24 px-6 bg-[#0a0a0a] text-white min-h-screen overflow-hidden">

      {/* 🔥 subtle ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.06),transparent_60%)]" />

      <div className="relative max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-20">
          <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-white/90 mb-4">
            {t('title')}
          </h1>

          <p className="text-sm text-white/50">
            {products.length} scents
            {seasonalCount > 0 && ` · ${seasonalCount} seasonal`}
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
          {products.map((product) => (
            <ProductCard
              key={product.slug}
              product={product}
              locale={locale}
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