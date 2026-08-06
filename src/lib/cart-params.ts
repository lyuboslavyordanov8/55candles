import { products } from '@/data/products'
import type { CartLine } from './order-total'

/**
 * A cart carried in the URL (AUDIT.md B-05, Q-34).
 *
 * **This is a stopgap, not the cart.** There is no database and no session
 * store, so a real cart cannot persist. Encoding it in the query string makes
 * the checkout reachable and the order flow testable today, and it has two
 * genuine properties worth keeping in mind:
 *
 * - It is **shareable and bookmarkable**, which is occasionally useful.
 * - It is **entirely untrusted**, which is fine, because it carries only slugs
 *   and quantities. Prices are re-read server-side in `calculateTotal`, so a
 *   hand-edited URL can change *what* is ordered but never *what it costs*.
 *
 * Format: `?items=cherry:2,vanilla:1`. Unknown slugs are dropped rather than
 * rejected, so a stale link degrades to a smaller cart instead of an error page.
 *
 * When the real cart lands (B-05) this module should be deleted, not extended:
 * a URL cart and a stored cart are two sources of truth for the same thing.
 */

/**
 * Per-line quantity cap. A URL is public and editable, so this is the only
 * thing standing between `?items=cherry:99999999` and an order confirmation
 * quoting a number nobody can fulfil.
 */
export const MAX_QUANTITY_PER_LINE = 20

/** Distinct products per cart. The catalogue is six items; this is generous. */
export const MAX_LINES = 10

/**
 * Parse `items` into cart lines.
 *
 * Silently forgiving by design — every failure mode degrades to "fewer items"
 * rather than an error, because a malformed cart URL is far more likely to be a
 * truncated paste than an attack, and there is nothing here worth defending.
 */
export function parseCartParam(raw: string | string[] | undefined): CartLine[] {
  if (typeof raw !== 'string' || raw.trim() === '') return []

  const known = new Set(products.map((p) => p.slug))
  const seen = new Map<string, number>()

  for (const entry of raw.split(',')) {
    const [slug, quantityText = '1'] = entry.trim().split(':')

    if (!known.has(slug)) continue

    const quantity = Number(quantityText)
    if (!Number.isInteger(quantity) || quantity < 1) continue

    // Repeated slugs accumulate rather than overwrite, so `cherry:1,cherry:2`
    // means three — which is what a naive "add to cart twice" link produces.
    const total = (seen.get(slug) ?? 0) + quantity
    seen.set(slug, Math.min(total, MAX_QUANTITY_PER_LINE))
  }

  return [...seen.entries()]
    .slice(0, MAX_LINES)
    .map(([slug, quantity]) => ({ slug, quantity }))
}

/** Build an `items` value. Used by the product page's order link. */
export function toCartParam(lines: readonly CartLine[]): string {
  return lines.map((line) => `${line.slug}:${line.quantity}`).join(',')
}

/** Checkout href for a single product, for the product page CTA. */
export function checkoutHref(locale: string, slug: string, quantity = 1): string {
  return `/${locale}/checkout?items=${encodeURIComponent(toCartParam([{ slug, quantity }]))}`
}
