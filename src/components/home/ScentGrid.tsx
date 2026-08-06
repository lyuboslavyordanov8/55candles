import { useTranslations } from 'next-intl'
import ProductCard from '@/components/products/ProductCard'
import Reveal from '@/components/motion/Reveal'
import { products } from '@/data/products'

interface Props { locale: string }

// Server Component (AUDIT.md S-14). ProductCard is now server-rendered too, so
// this whole grid — six cards of copy and imagery — costs no client JS beyond
// Reveal's wrappers.
export default function ScentGrid({ locale }: Props) {
  const t = useTranslations('collection')

  return (
    <section className="py-28 px-6 bg-cream-base">
      <div className="max-w-7xl mx-auto">

        {/* Title */}
        <Reveal y={24} duration={0.6} className="text-center mb-16">
          <h2 className="font-serif text-3xl md:text-5xl font-normal text-charcoal mb-3">
            {t('title')}
          </h2>
          {/* Still hardcoded English — part of AUDIT.md B-22, which is Phase 1
              work and deliberately untouched by this refactor. */}
          <p className="text-ink-ghost text-sm max-w-md mx-auto">
            Choose your mood. Each scent is crafted to transform your space.
          </p>
        </Reveal>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
          {products.map((product, i) => (
            <Reveal key={product.slug} y={24} delay={i * 0.05}>
              <ProductCard product={product} locale={locale} priority={i < 3} />
            </Reveal>
          ))}
        </div>

      </div>
    </section>
  )
}
