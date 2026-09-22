/**
 * The admin's icon set: five line icons, drawn here rather than installed.
 *
 * One family and one geometry — 16×16 box, 1.5 stroke, round caps, `currentColor`
 * — so they sit on a text baseline without adjustment. Written by hand because
 * the project has no icon library and five glyphs is not a reason to add a
 * dependency, a build step and a tree-shaking question to a shop's back office.
 *
 * They are navigation aids, not decoration: there is one per sidebar entry and
 * nowhere else. `aria-hidden` on all of them, because every icon here sits
 * beside its own label — an icon that repeats the word next to it only makes a
 * screen reader say everything twice.
 */

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** Orders: a parcel. */
export function BoxIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M2 5.2 8 2.3l6 2.9v5.6L8 13.7l-6-2.9z" />
      <path d="M2 5.2 8 8.1l6-2.9M8 8.1v5.6" />
    </svg>
  )
}

/** Invoices: a sheet with lines on it. */
export function DocumentIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 2h5l3 3v9H4z" />
      <path d="M9 2v3h3M6 8.5h4M6 11h3" />
    </svg>
  )
}

/** Proformas: the same sheet, with a price tag — an offer, not a record. */
export function TagIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M7.6 2H13v5.4l-6 6L2 8.5z" />
      <circle cx="10.2" cy="4.8" r="0.9" />
    </svg>
  )
}

/** A candle: the wordmark's companion, and the only ornamental glyph here. */
export function CandleIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M8 2.2c.9.9 1.3 1.6 1.3 2.2a1.3 1.3 0 0 1-2.6 0c0-.6.4-1.3 1.3-2.2Z" />
      <path d="M5.5 7h5v6.8h-5zM8 7v-.9" />
    </svg>
  )
}

/** Sign out. */
export function ExitIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M6 14H3V2h3M10 5l3 3-3 3M13 8H6" />
    </svg>
  )
}
