'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import MaterialIcon from '@/components/icons/MaterialIcon'
import { useFocusTrap } from '@/hooks/useFocusTrap'

const PANEL_ID = 'site-search'

export interface SearchableProduct {
  slug: string
  name: string
  href: string
  imagePath: string
  /** Everything worth matching against, pre-lowercased on the server. */
  haystack: string
}

interface Props {
  products: SearchableProduct[]
  labels: {
    open: string
    close: string
    placeholder: string
    empty: string
    /**
     * Screen-reader status, pre-rendered for every possible result count and
     * indexed by it: `resultCounts[2]` is the string for two results.
     *
     * It arrives as an array rather than a template because a formatter
     * function cannot cross the server/client boundary, and because Bulgarian
     * inflects the noun — "1 резултат" but "2 резултата". Substituting a
     * number into one fixed string gets that wrong half the time. The
     * catalogue is small enough that translating every case up front costs
     * nothing.
     */
    resultCounts: string[]
  }
}

/**
 * Catalogue search.
 *
 * The whole catalogue is six products in a local module, so this filters an
 * array in the browser rather than calling an API. That is not a shortcut to be
 * replaced later by "real" search — for a list this size, a network round trip
 * per keystroke would be slower and less reliable than the substring match
 * below, and it would need a backend that does not exist.
 *
 * If the catalogue ever grows past a few dozen products, this should become a
 * server route. The signal to watch is `products` getting big enough that
 * shipping it to the client costs more than a request would.
 *
 * The matching data (`haystack`) is assembled on the server so scent notes and
 * descriptors are searchable without shipping the whole product objects.
 */
export default function SearchOverlay({ products, labels }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const pathname = usePathname()

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  const panelRef = useFocusTrap<HTMLDivElement>(open, close)

  // Close on navigation, so following a result does not leave the panel up.
  useEffect(() => {
    close()
  }, [pathname, close])

  // The focus trap moves focus into the panel; put it in the input specifically
  // so typing works immediately.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const trimmed = query.trim().toLowerCase()

  const results = useMemo(() => {
    if (trimmed === '') return products
    // Every word must appear somewhere, so "cherry candle" narrows rather than
    // widens. Order does not matter.
    const terms = trimmed.split(/\s+/)
    return products.filter((p) => terms.every((term) => p.haystack.includes(term)))
  }, [products, trimmed])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={labels.open}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        className="p-1 text-ink-primary transition-opacity duration-200 hover:opacity-60"
      >
        <MaterialIcon name="search" className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id={PANEL_ID}
            role="dialog"
            aria-modal="true"
            aria-label={labels.open}
            tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] overflow-y-auto bg-paper-white p-6 md:p-10"
          >
            <div className="mx-auto max-w-3xl">
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="search-input" className="sr-only">
                  {labels.placeholder}
                </label>

                <div className="flex flex-1 items-center gap-3 border-b border-border pb-3">
                  <MaterialIcon name="search" className="h-5 w-5 shrink-0 text-ink-ghost" />
                  <input
                    id="search-input"
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={labels.placeholder}
                    autoComplete="off"
                    className="w-full bg-transparent font-sans text-lg text-ink-primary placeholder:text-ink-ghost focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={close}
                  aria-label={labels.close}
                  className="p-1 text-ink-primary transition-opacity duration-200 hover:opacity-60"
                >
                  <MaterialIcon name="close" className="h-6 w-6" />
                </button>
              </div>

              {/* Announced on every keystroke, so the result count is not
                  information only sighted users get. */}
              <p aria-live="polite" className="sr-only">
                {labels.resultCounts[results.length]}
              </p>

              {results.length === 0 ? (
                <p className="mt-10 text-center text-sm text-ink-secondary">{labels.empty}</p>
              ) : (
                <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
                  {results.map((product) => (
                    <li key={product.slug}>
                      <Link href={product.href} onClick={close} className="group block text-center">
                        <span className="relative block aspect-square overflow-hidden rounded-lg bg-paper-soft">
                          <Image
                            src={product.imagePath}
                            alt=""
                            fill
                            sizes="(max-width: 640px) 50vw, 33vw"
                            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                          />
                        </span>
                        <span className="mt-3 block font-serif text-base italic text-ink-primary">
                          {product.name}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
