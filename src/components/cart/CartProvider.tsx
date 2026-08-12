'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { products } from '@/data/products'
import { isPurchasable } from '@/data/pricing'
import { MAX_LINES, MAX_QUANTITY_PER_LINE } from '@/lib/cart-params'
import type { CartLine } from '@/lib/order-total'

/**
 * The cart.
 *
 * ── Where the truth lives ──────────────────────────────────────────────────
 * In the browser, in `localStorage`, and nowhere else. There is no cart table
 * and no session (AUDIT.md B-05), so this is the whole of it.
 *
 * **It hands off to checkout through the existing `?items=` URL** rather than
 * replacing it. `src/lib/cart-params.ts` already parses that parameter and
 * `/checkout` already reads it, so the checkout flow is untouched by this
 * feature: the drawer simply builds the same link the product page used to.
 * That keeps one contract instead of two, and keeps checkout links shareable.
 *
 * ── What is deliberately not here ──────────────────────────────────────────
 * No prices. The cart stores slugs and quantities only. A cart that carries its
 * own prices is a cart a customer can edit — `calculateTotal` re-reads every
 * price from the catalogue server-side, and that must stay the only source of
 * what anything costs. The subtotal the drawer shows is display-only.
 *
 * ── Hydration ──────────────────────────────────────────────────────────────
 * The first render is always an empty cart, on both server and client, and the
 * stored cart is loaded in an effect afterwards. Reading `localStorage` during
 * render would produce server markup that disagrees with the client and React
 * would discard it. `hydrated` exists so the badge can stay blank for that
 * first paint instead of flashing "0".
 */

const STORAGE_KEY = '55candles.cart.v1'

export interface CartContextValue {
  lines: CartLine[]
  /** Total items, counting quantities — what the header badge shows. */
  count: number
  /** False until the stored cart has been read; keeps the badge from flashing. */
  hydrated: boolean
  add: (slug: string, quantity?: number) => void
  setQuantity: (slug: string, quantity: number) => void
  remove: (slug: string) => void
  clear: () => void
  isOpen: boolean
  openCart: () => void
  closeCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

/**
 * Drop anything that is not a currently purchasable product.
 *
 * A stored cart can be weeks old, hand-edited, or left over from a catalogue
 * that has since changed. Everything here degrades to "fewer items" rather than
 * an error — the same forgiving posture `parseCartParam` takes, and for the
 * same reason: a broken cart must never be a broken page.
 */
function sanitise(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return []

  const known = new Set(products.map((p) => p.slug))
  const merged = new Map<string, number>()

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const { slug, quantity } = entry as { slug?: unknown; quantity?: unknown }

    if (typeof slug !== 'string' || !known.has(slug)) continue
    // A product that has gone out of season or lost its price cannot be
    // ordered, so it must not sit in the cart implying otherwise.
    if (!isPurchasable(slug)) continue
    if (!Number.isInteger(quantity) || (quantity as number) < 1) continue

    const total = (merged.get(slug) ?? 0) + (quantity as number)
    merged.set(slug, Math.min(total, MAX_QUANTITY_PER_LINE))
  }

  return [...merged.entries()]
    .slice(0, MAX_LINES)
    .map(([slug, quantity]) => ({ slug, quantity }))
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  // Load once, after mount. See the hydration note above.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) setLines(sanitise(JSON.parse(stored)))
    } catch {
      // Private mode, a full quota, or corrupt JSON. An empty cart is a fine
      // outcome; a crashed page is not.
    }
    setHydrated(true)
  }, [])

  // Persist on change, but never before the load has run — otherwise the empty
  // first render would overwrite the stored cart.
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      // Storage unavailable. The cart still works for this page view.
    }
  }, [lines, hydrated])

  const add = useCallback((slug: string, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((line) => line.slug === slug)

      if (existing) {
        return current.map((line) =>
          line.slug === slug
            ? { ...line, quantity: Math.min(line.quantity + quantity, MAX_QUANTITY_PER_LINE) }
            : line
        )
      }

      if (current.length >= MAX_LINES) return current
      return [...current, { slug, quantity: Math.min(quantity, MAX_QUANTITY_PER_LINE) }]
    })
  }, [])

  const setQuantity = useCallback((slug: string, quantity: number) => {
    setLines((current) =>
      quantity < 1
        ? current.filter((line) => line.slug !== slug)
        : current.map((line) =>
            line.slug === slug
              ? { ...line, quantity: Math.min(quantity, MAX_QUANTITY_PER_LINE) }
              : line
          )
    )
  }, [])

  const remove = useCallback((slug: string) => {
    setLines((current) => current.filter((line) => line.slug !== slug))
  }, [])

  const clear = useCallback(() => setLines([]), [])
  const openCart = useCallback(() => setIsOpen(true), [])
  const closeCart = useCallback(() => setIsOpen(false), [])

  const count = lines.reduce((total, line) => total + line.quantity, 0)

  const value = useMemo(
    () => ({
      lines,
      count,
      hydrated,
      add,
      setQuantity,
      remove,
      clear,
      isOpen,
      openCart,
      closeCart,
    }),
    [lines, count, hydrated, add, setQuantity, remove, clear, isOpen, openCart, closeCart]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used inside <CartProvider>')
  }
  return context
}
