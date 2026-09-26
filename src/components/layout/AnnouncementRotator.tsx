'use client'

import { useEffect, useState } from 'react'

/** How long each line stays up. Long enough to read twice at a glance. */
const INTERVAL_MS = 5000

/**
 * The announcement bar's lines, one at a time, cross-fading in place.
 *
 * Every line is rendered, stacked in the same grid cell, and only the opacity
 * changes — so the bar is as tall as its tallest line from the first paint and
 * never jumps when the text swaps (the header's height is a fixed number the
 * hero relies on). The first line is what the server renders; the rotation is
 * the only thing that needs JavaScript.
 *
 * Paused while hovered or focused, so nobody loses a line mid-read. Not a live
 * region: a screen reader reads the current line once, rather than being
 * interrupted every few seconds. Under reduced motion the global CSS turns the
 * fade into a plain swap.
 */
export default function AnnouncementRotator({ lines }: { lines: readonly string[] }) {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (lines.length < 2 || paused) return
    const timer = setInterval(() => setCurrent((index) => (index + 1) % lines.length), INTERVAL_MS)
    return () => clearInterval(timer)
  }, [lines.length, paused])

  return (
    <div
      className="grid"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {lines.map((line, index) => (
        <p
          key={line}
          aria-hidden={index !== current}
          className={`col-start-1 row-start-1 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-primary transition-opacity duration-700 ${
            index === current ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {line}
        </p>
      ))}
    </div>
  )
}
