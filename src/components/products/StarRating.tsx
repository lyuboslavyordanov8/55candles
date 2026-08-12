/**
 * Star rating with its review count.
 *
 * Renders halves, because a 4.5 shown as 5 solid stars is a small lie repeated
 * on every card. The fill is a clipped overlay rather than a separate
 * half-star glyph, so any fraction works.
 *
 * Server Component — static markup, no client JS.
 *
 * Accessibility: the stars are decorative and hidden; the same information is
 * given to screen readers as a sentence, because "★★★★★ 42" read aloud is
 * noise. The count is visible next to the stars for sighted users.
 */
interface Props {
  /** 0–5. Values outside that range are clamped rather than overflowing. */
  rating: number
  /**
   * Shown in brackets after the stars. Omit where there is nothing to count —
   * a single testimonial's rating is not "1 review", and printing a number
   * there would invent a statistic.
   */
  reviewCount?: number
  /** Localised, e.g. "4.9 от 5 звезди, 42 отзива". */
  label: string
  className?: string
}

const Star = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${className}`} aria-hidden focusable="false">
    <path
      fill="currentColor"
      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z"
    />
  </svg>
)

export default function StarRating({ rating, reviewCount, label, className = '' }: Props) {
  const clamped = Math.min(5, Math.max(0, rating))
  const percent = (clamped / 5) * 100

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <span className="relative inline-flex" aria-hidden>
        {/* Empty track */}
        <span className="flex text-border">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} />
          ))}
        </span>

        {/* Filled overlay, clipped to the rating */}
        <span
          className="absolute inset-0 flex overflow-hidden text-clay"
          style={{ width: `${percent}%` }}
        >
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className="shrink-0" />
          ))}
        </span>
      </span>

      {reviewCount !== undefined && (
        <span className="text-[11px] tracking-wide text-ink-ghost">({reviewCount})</span>
      )}

      <span className="sr-only">{label}</span>
    </div>
  )
}
