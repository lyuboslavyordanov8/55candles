import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import ProductImagePair from './ProductImagePair'
import StarRating from './StarRating'
import Price from '@/components/commerce/Price'
import AddToCartButton from '@/components/cart/AddToCartButton'
import { isPurchasable } from '@/data/pricing'
import { productImages } from '@/data/products'
import type { Product } from '@/types/product'

interface Props {
  product: Product
  locale: string
  /**
   * Preload this card's image. Only set it for cards above the fold — the
   * first row of a grid — otherwise `priority` defeats lazy loading and
   * delays the real LCP element.
   */
  priority?: boolean
}

/**
 * One product in a grid: image, name, rating, price, and a quick add.
 *
 * ── Why this is not one big <a> any more ───────────────────────────────────
 * It used to be. Adding the quick-add control broke that: a `<button>` inside
 * an `<a>` is invalid HTML, and browsers recover from it inconsistently — the
 * click either adds to the cart or navigates, depending on the browser.
 *
 * The fix is the stretched-link pattern. The card is a positioned container,
 * the product name is the only real link, and its `after:` pseudo-element is
 * absolutely positioned over the whole card to make all of it clickable. The
 * button then sits above that overlay on the z-axis. The result has one link
 * and one button, both reachable by keyboard, in the right reading order, with
 * no nesting.
 *
 * Server Component: the hover lift and image swap are CSS, so the only
 * JavaScript is the add-to-cart button itself.
 */
export default function ProductCard({ product, locale, priority = false }: Props) {
  const t = useTranslations('collection')

  const isOutOfSeason = product.seasonal !== null && !product.seasonal.active
  const hasRating = product.rating !== undefined && product.reviewCount !== undefined
  const canBuy = isPurchasable(product.slug)

  // A second photo doubles as the hover state — it previews the gallery on the
  // detail page without adding any control to the card.
  const images = productImages(product)
  const hoverImage = product.hoverImagePath ?? images[1]

  return (
    <div className="group relative text-center transition-transform duration-300 ease-out hover:-translate-y-1">
      {/* IMAGE */}
      <div className="relative aspect-square overflow-hidden rounded-lg bg-paper-soft">
        {hoverImage ? (
          <ProductImagePair
            src={product.imagePath}
            hoverSrc={hoverImage}
            alt={t('imageAlt', { name: product.name })}
            priority={priority}
          />
        ) : (
          <Image
            src={product.imagePath}
            alt={t('imageAlt', { name: product.name })}
            fill
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 ease-out will-change-transform group-hover:scale-[1.04]"
          />
        )}

        {/* Merchandising badge — pastel, never dark. */}
        {product.badge && (
          <span className="absolute left-4 top-4 rounded-full bg-pastel-butter px-3 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-primary">
            {t(`badge.${product.badge}`)}
          </span>
        )}

        {/* Seasonal overlay */}
        {isOutOfSeason && (
          <div className="absolute inset-0 flex items-center justify-center bg-paper-soft/85 backdrop-blur-sm">
            <span className="text-xs uppercase tracking-[0.15em] text-ink-secondary">
              {t('seasonal')}
            </span>
          </div>
        )}

        {/*
          Quick add. Always visible on touch, where there is no hover to reveal
          it and a hidden control is simply a missing one; revealed on hover or
          keyboard focus from `md` up, so the grid stays quiet while browsing.
          `z-10` lifts it above the stretched link below.

          It hugs the bottom-right corner on phones, where the button is a small
          circle, and spans the card from `md` up, where it is a labelled pill.
        */}
        {canBuy && (
          <div className="absolute bottom-3 right-3 z-10 transition-all duration-300 md:left-3 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100">
            <AddToCartButton slug={product.slug} productName={product.name} />
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div className="mt-5 space-y-2">
        <h3 className="font-serif text-xl font-normal italic text-ink-primary">
          {/*
            The only link on the card. `after:` stretches its hit area over the
            whole card — including the image — without wrapping anything.
          */}
          <Link
            href={`/${locale}/products/${product.slug}`}
            className="after:absolute after:inset-0 after:content-[''] hover:opacity-70"
          >
            {product.name}
          </Link>
        </h3>

        {hasRating && (
          <StarRating
            rating={product.rating!}
            reviewCount={product.reviewCount!}
            label={t('ratingLabel', {
              rating: product.rating!.toFixed(1),
              count: product.reviewCount!,
            })}
          />
        )}

        <Price
          slug={product.slug}
          locale={locale}
          className="text-sm font-medium tracking-wide"
        />
      </div>
    </div>
  )
}
