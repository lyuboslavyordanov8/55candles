'use client'

import { useOptimistic, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import MaterialIcon from '@/components/icons/MaterialIcon'
import { useCart } from '@/components/cart/CartProvider'
import { getProductBySlug } from '@/data/products'
import { getPricing } from '@/data/pricing'
import { formatMoney, multiplyMoney } from '@/lib/money'
import { MAX_QUANTITY_PER_LINE, toCartParam } from '@/lib/cart-params'
import type { CartLine } from '@/lib/order-total'

/**
 * The basket, editable, at the top of checkout (AUDIT.md B-05).
 *
 * It used to be a read-only list. That was wrong for the last screen before an
 * order: the customer has arrived here to commit, notices they want two candles
 * rather than one, and their only options were the back button or the cart
 * drawer on another page. Every line is now named, counted and priced, and every
 * count can be changed in place.
 *
 * ── The URL is still the cart ───────────────────────────────────────────────
 * A change rewrites `?items=` and lets the server re-render, rather than keeping
 * a second copy of the basket in this component. That matters: the per-line
 * prices, the delivery quote and the total are all computed server-side from the
 * catalogue (see `order-total.ts`), and a client that edited its own copy would
 * be showing numbers nothing had verified. `router.replace`, not `push`, so the
 * back button leaves checkout instead of walking back through every click.
 *
 * `useOptimistic` covers the round trip, so the number under the customer's
 * finger changes immediately instead of after a server render.
 *
 * What it does *not* cover is arithmetic. An optimistic value is reverted once
 * its transition settles, so a second click can find the props still holding the
 * previous basket — and two presses of + would both ask for 3, losing one. The
 * quantity each click counts from is therefore taken from `requested` below,
 * which remembers what was last asked for until the server catches up.
 *
 * ── Why it also writes to the cart provider ─────────────────────────────────
 * `CartProvider` owns the stored cart that the header badge and the drawer read.
 * Editing here without telling it would leave the badge claiming three items
 * while checkout showed two, and reopening the drawer would resurrect the old
 * quantity. The URL is the truth on this page; the provider is kept in step with
 * it.
 */

interface Props {
  /** Lines as the server parsed them from `?items=`. The authority. */
  lines: CartLine[]
  locale: string
}

/** A requested quantity for one slug. Below 1 means "remove the line". */
interface Change {
  slug: string
  quantity: number
}

function apply(lines: readonly CartLine[], { slug, quantity }: Change): CartLine[] {
  if (quantity < 1) return lines.filter((line) => line.slug !== slug)

  return lines.map((line) =>
    line.slug === slug
      ? { ...line, quantity: Math.min(quantity, MAX_QUANTITY_PER_LINE) }
      : line
  )
}

export default function BasketEditor({ lines, locale }: Props) {
  const t = useTranslations('checkout')
  const tCart = useTranslations('cart')
  const router = useRouter()
  const { setQuantity } = useCart()

  const [pending, startTransition] = useTransition()
  const [shown, showChange] = useOptimistic(lines, apply)

  /**
   * What has been asked for but not yet confirmed by a server render, per slug.
   * Cleared the moment a new `lines` prop arrives — that *is* the confirmation,
   * and a fresh array identity is exactly what a server render produces.
   */
  const requested = useRef(new Map<string, number>())
  const confirmed = useRef(lines)
  if (confirmed.current !== lines) {
    confirmed.current = lines
    requested.current = new Map()
  }

  /** The count the next ± should count from: the latest intent, not the props. */
  function quantityOf(line: CartLine) {
    return requested.current.get(line.slug) ?? line.quantity
  }

  function change(slug: string, quantity: number) {
    requested.current.set(slug, Math.min(Math.max(quantity, 0), MAX_QUANTITY_PER_LINE))

    // Rebuilt from the confirmed basket plus every outstanding request, so a
    // second edit cannot drop the first one back out of the URL.
    let next: CartLine[] = [...lines]
    for (const [pendingSlug, pendingQuantity] of requested.current) {
      next = apply(next, { slug: pendingSlug, quantity: pendingQuantity })
    }

    startTransition(() => {
      // Optimistic first, so the count moves on this frame.
      showChange({ slug, quantity })
      // Keep the stored cart, and so the header badge, in step.
      setQuantity(slug, quantity)
      // An empty basket drops the parameter rather than sending `items=`.
      router.replace(
        next.length > 0
          ? `/${locale}/checkout?items=${encodeURIComponent(toCartParam(next))}`
          : `/${locale}/checkout`,
        { scroll: false }
      )
    })
  }

  return (
    <ul
      aria-busy={pending || undefined}
      className="divide-y divide-border rounded-sm border border-border"
    >
      {shown.map((line) => {
        const product = getProductBySlug(line.slug)
        const entry = getPricing(line.slug)
        const lineTotal = entry ? multiplyMoney(entry.price, line.quantity) : null
        const name = product?.name ?? line.slug

        return (
          <li key={line.slug} className="flex gap-4 p-4">
            {product && (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-sm bg-cream-surface">
                <Image
                  src={product.imagePath}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </div>
            )}

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="text-charcoal">{name}</span>
                {/*
                  `data-line-total` gives tests a number to assert on that is not
                  `Intl` output, since the rendered string is locale-formatted.
                */}
                <span className="shrink-0 text-charcoal" data-line-total={lineTotal?.amountMinor}>
                  {lineTotal ? formatMoney(lineTotal, locale) : t('lineUnpriced')}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                {/* Same control as the cart drawer, so the gesture is learned once. */}
                <div className="inline-flex items-center rounded-full border border-border">
                  <button
                    type="button"
                    onClick={() => change(line.slug, quantityOf(line) - 1)}
                    aria-label={tCart('decreaseNamed', { name })}
                    className="px-3 py-1 text-charcoal transition-opacity duration-200 hover:opacity-60"
                  >
                    −
                  </button>
                  <span
                    aria-live="polite"
                    className="min-w-8 text-center text-sm tabular-nums text-charcoal"
                  >
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => change(line.slug, quantityOf(line) + 1)}
                    disabled={line.quantity >= MAX_QUANTITY_PER_LINE}
                    aria-label={tCart('increaseNamed', { name })}
                    className="px-3 py-1 text-charcoal transition-opacity duration-200 hover:opacity-60 disabled:opacity-30"
                  >
                    +
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {/*
                    The unit price, so a line total of 39,98 € is self-evidently
                    two candles and not a price rise.
                  */}
                  {entry && (
                    <span className="text-xs text-ink-ghost tabular-nums">
                      {line.quantity} × {formatMoney(entry.price, locale)}
                    </span>
                  )}

                  {/*
                    A direct remove as well as pressing − down to zero: taking
                    something out of a basket should not cost five clicks.
                  */}
                  <button
                    type="button"
                    onClick={() => change(line.slug, 0)}
                    aria-label={tCart('removeNamed', { name })}
                    className="text-ink-ghost transition-colors duration-200 hover:text-charcoal"
                  >
                    <MaterialIcon name="close" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
