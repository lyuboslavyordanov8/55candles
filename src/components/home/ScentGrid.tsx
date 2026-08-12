import Link from 'next/link'
import { useTranslations } from 'next-intl'
import ProductCard from '@/components/products/ProductCard'
import Reveal from '@/components/motion/Reveal'
import { homepageProducts } from '@/data/products'

interface Props { locale: string }

/**
 * The "Продукти" grid: 1 column on mobile, 2 on tablet, 3 on desktop.
 *
 * Which candles appear here, and in what order, is `HOMEPAGE_PRODUCT_SLUGS` in
 * `src/data/products.ts` — not this file.
 *
 * With five products the last row holds a single card. `justify-items-start`
 * plus a fixed-width column would left-align it, but the simpler answer is to
 * let the grid do it: each card fills its own cell and the empty cells stay
 * empty, so the fifth card is the natural width of a column and sits at the
 * start of the row. No stretched card, no special case.
 *
 * Server Component — the whole grid costs no client JS beyond Reveal's
 * wrappers (AUDIT.md S-14).
 */
export default function ScentGrid({ locale }: Props) {
  const t = useTranslations('collection')
  const products = homepageProducts()

  return (
    <section className="bg-paper-white px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal y={20} duration={0.6} className="mb-14 text-center md:mb-20">
          <h2 className="font-serif text-3xl font-normal italic text-ink-primary md:text-5xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-secondary">
            {t('subtitle')}
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product, i) => (
            <Reveal key={product.slug} y={20} delay={i * 0.05}>
              <ProductCard product={product} locale={locale} priority={i < 3} />
            </Reveal>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Link
            href={`/${locale}/products`}
            className="inline-flex items-center gap-2 border-b border-clay pb-0.5 text-xs font-medium uppercase tracking-[0.18em] text-clay transition-opacity duration-200 hover:opacity-70"
          >
            {t('viewAll')} <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
