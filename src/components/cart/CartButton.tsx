'use client'

import { useTranslations } from 'next-intl'
import MaterialIcon from '@/components/icons/MaterialIcon'
import { useCart } from './CartProvider'

/**
 * The header cart control: opens the drawer, and carries the item count.
 *
 * The count is suppressed until `hydrated`. The cart is read from
 * `localStorage` after mount, so before that the honest answer is "not known
 * yet" — rendering a badge then would show 0 to someone with three items in
 * their cart and correct itself a frame later.
 *
 * It is a button, not a link. There is no cart page: the drawer is the cart.
 * Marking it up as a link to nowhere would promise a navigation that never
 * happens, and would break middle-click and "open in new tab".
 */
export default function CartButton() {
  const t = useTranslations('cart')
  const { count, hydrated, openCart } = useCart()

  const showBadge = hydrated && count > 0

  return (
    <button
      type="button"
      onClick={openCart}
      // The count belongs in the accessible name, not only in a coloured dot.
      aria-label={showBadge ? t('openWithCount', { count }) : t('open')}
      className="relative p-1 text-ink-primary transition-opacity duration-200 hover:opacity-60"
    >
      <MaterialIcon name="shoppingBag" className="h-5 w-5" />

      {showBadge && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 text-[10px] font-semibold leading-none text-paper-white"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}
