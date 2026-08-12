'use client'

import Image from 'next/image'
import { useState } from 'react'

/**
 * Product photo gallery: one large image with a thumbnail strip beneath.
 *
 * ── Why a strip and not a carousel ─────────────────────────────────────────
 * Two or three photos, all worth seeing. A carousel hides how many there are
 * and makes reaching the third one a sequence of clicks; thumbnails show the
 * whole set at once and reach any of them in one. Carousels earn their keep at
 * eight or ten images, not at two.
 *
 * ── Accessibility ──────────────────────────────────────────────────────────
 * The thumbnails are a `tablist`. That is the honest role — they select which
 * of several panels is shown — and it brings arrow-key navigation for free in
 * every screen reader, which a row of buttons would not. Roving `tabIndex`
 * keeps the strip a single tab stop rather than one per photo.
 *
 * Every image is rendered, with the inactive ones hidden, so switching never
 * waits on a network request. At two or three photos that costs nothing and
 * removes the flash of empty frame that lazy-swapping a `src` produces.
 */
interface Props {
  images: string[]
  /** Describes the product; the photo number is appended per image. */
  alt: string
  /**
   * One label per image, already translated — "Photo 2 of 3" and so on.
   *
   * Built by the caller rather than interpolated here. A template like
   * "Photo {index} of {total}" cannot survive the trip: next-intl parses
   * braces as ICU placeholders, so asking for the raw string returns the
   * message key instead, and the thumbnails end up labelled `collection.photoOf`.
   */
  imageLabels: string[]
  priority?: boolean
}

export default function ProductGallery({
  images,
  alt,
  imageLabels,
  priority = false,
}: Props) {
  const [active, setActive] = useState(0)

  const label = (index: number) => imageLabels[index] ?? ''

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const last = images.length - 1
    let next: number | null = null

    if (event.key === 'ArrowRight') next = active === last ? 0 : active + 1
    else if (event.key === 'ArrowLeft') next = active === 0 ? last : active - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last

    if (next === null) return
    event.preventDefault()
    setActive(next)
    // Move focus with selection, which is what `tablist` semantics promise.
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-paper-soft">
        {images.map((src, index) => (
          <Image
            key={src}
            src={src}
            alt={images.length > 1 ? `${alt} — ${label(index)}` : alt}
            fill
            priority={priority && index === 0}
            sizes="(max-width: 768px) 100vw, 50vw"
            className={`object-cover transition-opacity duration-300 ${
              index === active ? 'opacity-100' : 'opacity-0'
            }`}
            // Hidden panels must be out of the accessibility tree, or a screen
            // reader reads three descriptions of one product.
            aria-hidden={index !== active}
          />
        ))}
      </div>

      {/* One photo needs no picker. */}
      {images.length > 1 && (
        <div role="tablist" aria-label={alt} onKeyDown={onKeyDown} className="flex gap-3">
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-label={label(index)}
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
              className={`relative h-20 w-20 overflow-hidden rounded-lg bg-paper-soft transition-all duration-200 ${
                index === active
                  ? 'ring-2 ring-clay ring-offset-2 ring-offset-paper-white'
                  : 'opacity-70 hover:opacity-100'
              }`}
            >
              <Image src={src} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
