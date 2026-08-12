'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useTranslations, useLocale } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import MaterialIcon from '@/components/icons/MaterialIcon'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { getProductBySlug } from '@/data/products'
import { getPricing } from '@/data/pricing'
import { formatMoney, multiplyMoney, sumMoney, ZERO } from '@/lib/money'
import { toCartParam } from '@/lib/cart-params'
import { useCart } from './CartProvider'

/**
 * The cart, as a side sheet.
 *
 * A drawer rather than a page because adding to the cart is not a destination:
 * the shopper is mid-browse, and a full navigation costs them their place in
 * the grid. It closes back to exactly where they were.
 *
 * ── The subtotal here is not the price ─────────────────────────────────────
 * It is goods only — no delivery, no cash-on-delivery fee — and it is computed
 * in the browser purely to show. `calculateTotal` recomputes everything
 * server-side from the catalogue at checkout, and that is the number that
 * binds. The label says "subtotal" and the copy says delivery comes later,
 * because a total that grows after the customer commits to it is the single
 * most complained-about pattern in e-commerce, and in the EU showing a
 * misleading headline price is a compliance problem as well as a rude one.
 *
 * ── Handing off ────────────────────────────────────────────────────────────
 * The checkout link is the same `?items=slug:qty` URL the product page has
 * always produced, so nothing in the checkout flow had to change to support a
 * cart existing.
 */
export default function CartDrawer() {
  const t = useTranslations('cart')
  const locale = useLocale()
  const { lines, isOpen, closeCart, setQuantity, remove, count } = useCart()

  /**
   * Also locks body scroll while open — a drawer that leaves the page
   * scrollable behind it lets a phone user scroll the grid instead of the cart
   * and think the cart is stuck.
   *
   * That lock used to be duplicated here in a second effect, and the two fought
   * each other. Both saved "the previous value" and restored it on cleanup, but
   * this component's effect ran *after* the hook's, so it captured the
   * `hidden` the hook had just written rather than the real prior value. React
   * tears effects down in registration order, so the hook restored `''` and
   * this one immediately put `hidden` back: the page stayed unscrollable until
   * a reload. The hook is the single owner now. Do not re-add a local lock.
   */
  const panelRef = useFocusTrap<HTMLDivElement>(isOpen, closeCart)

  const items = lines
    .map((line) => {
      const product = getProductBySlug(line.slug)
      const pricing = getPricing(line.slug)
      return product ? { line, product, pricing } : null
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const subtotal = sumMoney(
    items.map(({ line, pricing }) =>
      pricing ? multiplyMoney(pricing.price, line.quantity) : ZERO
    )
  )

  const anythingUnpriced = items.some(({ pricing }) => !pricing)

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Scrim. Cream at low opacity, never black. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            aria-hidden
            className="fixed inset-0 z-[70] bg-ink-primary/25 backdrop-blur-[2px]"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('title')}
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed inset-y-0 right-0 z-[71] flex w-full max-w-md flex-col bg-paper-white shadow-xl shadow-clay/20"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <h2 className="font-serif text-xl italic text-ink-primary">
                {t('title')}
                {count > 0 && (
                  <span className="ml-2 font-sans text-sm not-italic text-ink-ghost">
                    ({count})
                  </span>
                )}
              </h2>

              <button
                type="button"
                onClick={closeCart}
                aria-label={t('close')}
                className="p-1 text-ink-primary transition-opacity duration-200 hover:opacity-60"
              >
                <MaterialIcon name="close" className="h-6 w-6" />
              </button>
            </div>

            {/* Lines */}
            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
                <p className="text-sm text-ink-secondary">{t('empty')}</p>
                <Link
                  href={`/${locale}/products`}
                  onClick={closeCart}
                  className="border-b border-clay pb-0.5 text-xs font-medium uppercase tracking-[0.18em] text-clay transition-opacity duration-200 hover:opacity-70"
                >
                  {t('browse')}
                </Link>
              </div>
            ) : (
              <ul className="flex-1 divide-y divide-border overflow-y-auto px-6">
                {items.map(({ line, product, pricing }) => (
                  <li key={line.slug} className="flex gap-4 py-5">
                    <Link
                      href={`/${locale}/products/${product.slug}`}
                      onClick={closeCart}
                      className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-md bg-paper-soft"
                    >
                      <Image
                        src={product.imagePath}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    </Link>

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <Link
                          href={`/${locale}/products/${product.slug}`}
                          onClick={closeCart}
                          className="font-serif text-base italic text-ink-primary hover:opacity-70"
                        >
                          {product.name}
                        </Link>

                        <button
                          type="button"
                          onClick={() => remove(line.slug)}
                          aria-label={t('removeNamed', { name: product.name })}
                          className="shrink-0 text-ink-ghost transition-colors duration-200 hover:text-ink-primary"
                        >
                          <MaterialIcon name="close" className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        {/* Quantity */}
                        <div className="inline-flex items-center rounded-full border border-border">
                          <button
                            type="button"
                            onClick={() => setQuantity(line.slug, line.quantity - 1)}
                            aria-label={t('decreaseNamed', { name: product.name })}
                            className="px-3 py-1 text-ink-primary transition-opacity duration-200 hover:opacity-60"
                          >
                            −
                          </button>
                          <span
                            aria-live="polite"
                            className="min-w-8 text-center text-sm tabular-nums text-ink-primary"
                          >
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQuantity(line.slug, line.quantity + 1)}
                            aria-label={t('increaseNamed', { name: product.name })}
                            className="px-3 py-1 text-ink-primary transition-opacity duration-200 hover:opacity-60"
                          >
                            +
                          </button>
                        </div>

                        <p className="text-sm font-medium text-ink-primary">
                          {pricing
                            ? formatMoney(multiplyMoney(pricing.price, line.quantity), locale)
                            : t('priceOnRequest')}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-border px-6 py-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-ink-secondary">
                    {t('subtotal')}
                  </span>
                  <span className="text-lg font-medium text-ink-primary">
                    {anythingUnpriced ? t('priceOnRequest') : formatMoney(subtotal, locale)}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
                  {t('deliveryNote')}
                </p>

                <Link
                  href={`/${locale}/checkout?items=${encodeURIComponent(toCartParam(lines))}`}
                  onClick={closeCart}
                  className="mt-5 flex w-full items-center justify-center rounded-full bg-ink-primary px-6 py-4 text-xs font-medium uppercase tracking-[0.18em] text-paper-white transition-colors duration-300 hover:bg-clay"
                >
                  {t('checkout')}
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
