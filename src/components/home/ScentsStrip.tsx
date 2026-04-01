import { useTranslations } from 'next-intl'
import ProductCard from '@/components/products/ProductCard'
import { products } from '@/data/products'

interface Props { locale: string }

export default function ScentsStrip({ locale }: Props) {
  const t = useTranslations('collection')
  return (
    <section className="py-16 px-6 bg-cream overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-xs font-bold tracking-widest uppercase text-espresso/50 mb-8 text-center">{t('title')}</h2>
        <div className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory">
          {products.map((product) => (
            <div key={product.slug} className="snap-start shrink-0 w-56">
              <ProductCard product={product} locale={locale} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
