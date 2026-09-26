'use client'

import { useEffect, useState } from 'react'

export interface AnnouncementLine {
  text: string
  /** How long the line stays up before the next one fades in. */
  ms: number
}

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
 *
 * A size smaller on phones: the offer is ~330 px at 11 px, which wraps on a
 * 360 px screen; at 10 px with tighter tracking it is ~285 px and fits 320.
 */
export default function AnnouncementRotator({ lines }: { lines: readonly AnnouncementLine[] }) {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (lines.length < 2 || paused) return
    // A timeout per line rather than one interval, because each line has its
    // own duration. Resuming after a pause gives the line its full time again.
    const timer = setTimeout(() => setCurrent((current + 1) % lines.length), lines[current].ms)
    return () => clearTimeout(timer)
  }, [lines, current, paused])

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
          key={line.text}
          aria-hidden={index !== current}
          className={`col-start-1 row-start-1 px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.1em] sm:text-[11px] sm:tracking-[0.14em] text-ink-primary transition-opacity duration-700 ${
            index === current ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {line.text}
        </p>
      ))}
    </div>
  )
}
