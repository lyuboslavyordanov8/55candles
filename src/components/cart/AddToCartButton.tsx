'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import MaterialIcon from '@/components/icons/MaterialIcon'
import { useCart } from './CartProvider'

/**
 * Adds one of a product to the cart.
 *
 * ── Why it does not open the drawer ────────────────────────────────────────
 * The reference site pops its cart drawer on every add. That suits a long
 * catalogue where adding is the end of a search; here the grid is five candles
 * and a shopper is likely to add two or three in a row. Throwing a panel over
 * the grid after each one interrupts exactly the flow we want. Instead the
 * button confirms in place, the header badge increments, and opening the cart
 * stays the shopper's decision.
 *
 * The confirmation reverts after a moment so the control is ready for a second
 * add — and so a card that has been added to does not look permanently
 * different from one that has not.
 *
 * ── Announcing it ──────────────────────────────────────────────────────────
 * The visual confirmation is a label swap, which a screen reader would not
 * necessarily report, and the badge is across the page. The live region says
 * what happened, once, in words.
 */
const CONFIRMATION_MS = 1800

interface Props {
  slug: string
  productName: string
  /**
   * `quick` is the small pill overlaid on a product card; `primary` is the
   * full-width button on the product page.
   */
  variant?: 'quick' | 'primary'
  className?: string
}

export default function AddToCartButton({
  slug,
  productName,
  variant = 'quick',
  className = '',
}: Props) {
  const t = useTranslations('cart')
  const { add } = useCart()
  const [justAdded, setJustAdded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear on unmount so a state update cannot land on a card that has been
  // filtered out of the grid in the meantime.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function handleAdd() {
    add(slug)
    setJustAdded(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setJustAdded(false), CONFIRMATION_MS)
  }

  const base =
    'inline-flex items-center justify-center gap-2 font-sans font-medium uppercase tracking-[0.14em] transition-colors duration-200 disabled:cursor-not-allowed bg-ink-primary text-paper-white hover:bg-clay'

  /**
   * `quick` is a 44px circular icon on phones and a labelled pill from `md` up.
   *
   * The split is not decoration. On a phone the control cannot wait for a hover
   * that never comes, so it sits on the image permanently — and a full-width
   * bar there covers the product it is selling. An icon button is small enough
   * to live in the corner, and 44px keeps it a legal tap target despite
   * looking small. On desktop the button is revealed on hover and has room, so
   * it says what it does in words rather than making the shopper infer it.
   */
  const styles =
    variant === 'quick'
      ? 'h-11 w-11 rounded-full text-[11px] md:h-auto md:w-full md:px-4 md:py-2.5'
      : 'w-full rounded-full px-6 py-4 text-xs'

  return (
    <>
      <button
        type="button"
        onClick={handleAdd}
        // The accessible name carries the product, because on a grid there are
        // five identical add buttons — and on phones there is no visible label
        // to tell them apart at all.
        aria-label={t('addNamed', { name: productName })}
        className={`${base} ${styles} ${className}`}
      >
        {variant === 'quick' && (
          <MaterialIcon
            name={justAdded ? 'check' : 'shoppingBagAdd'}
            // h-6 rather than h-5: the owner asked for a slightly larger
            // glyph. The button stays 44px, so only the mark grows.
            className="h-6 w-6 md:hidden"
          />
        )}

        <span
          className={
            variant === 'quick'
              ? 'hidden items-center gap-2 md:inline-flex'
              : 'inline-flex items-center gap-2'
          }
        >
          {justAdded && <MaterialIcon name="check" className="h-3.5 w-3.5" />}
          {justAdded ? t('added') : t('add')}
        </span>
      </button>

      <span role="status" aria-live="polite" className="sr-only">
        {justAdded ? t('addedNamed', { name: productName }) : ''}
      </span>
    </>
  )
}
