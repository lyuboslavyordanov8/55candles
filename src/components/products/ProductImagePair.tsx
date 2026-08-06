'use client'

import Image from 'next/image'
import { useState } from 'react'

const SIZES = '(max-width: 768px) 100vw, 33vw'

/**
 * Cross-fades to a second product photo on hover.
 *
 * Client-side only because the swap must not happen until the hover image has
 * actually decoded — otherwise the card flashes empty on first hover. That
 * needs `onLoad` state.
 *
 * ProductCard renders this **only** when `hoverImagePath` is set, so while the
 * `_alt.webp` assets are missing (AUDIT.md Q-36) this component is never
 * reached and costs nothing at runtime.
 */
export default function ProductImagePair({
  src,
  hoverSrc,
  alt,
  priority,
}: {
  src: string
  hoverSrc: string
  alt: string
  priority: boolean
}) {
  const [hoverLoaded, setHoverLoaded] = useState(false)

  return (
    <>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={SIZES}
        className={`object-cover transition duration-500 ease-out will-change-transform ${
          hoverLoaded
            ? 'group-hover:opacity-0 group-hover:scale-[1.04]'
            : 'group-hover:scale-[1.04]'
        }`}
      />

      <Image
        src={hoverSrc}
        alt=""
        aria-hidden="true"
        fill
        loading="lazy"
        sizes={SIZES}
        onLoad={() => setHoverLoaded(true)}
        className={`object-cover transition duration-500 ease-out will-change-opacity ${
          hoverLoaded ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'
        }`}
      />
    </>
  )
}
