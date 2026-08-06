'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * The one client-side animation primitive.
 *
 * Every section on this site had the same shape: a `motion.*` element with an
 * `initial`/`animate`-or-`whileInView` pair wrapped around otherwise static
 * markup. That single `motion` import forced the whole component — icons,
 * copy, layout and all — into the client bundle (AUDIT.md S-14).
 *
 * Hoisting the animation here inverts that: `Reveal` is the only part that
 * ships, and its `children` arrive as already-rendered server output. The
 * animation behaviour is unchanged.
 *
 * `as` exists so headings stay headings — animating a wrapper `div` around an
 * `<h2>` would work, but it changes the markup for no reason.
 */
const ELEMENTS = {
  div: motion.div,
  h1: motion.h1,
  h2: motion.h2,
  p: motion.p,
} as const

export interface RevealProps {
  children?: ReactNode
  /** Element to render. Defaults to `div`. */
  as?: keyof typeof ELEMENTS
  className?: string
  /** Pixels to travel upward into place. Omit for a pure crossfade. */
  y?: number
  /** Scale to grow from. Omit to leave scale alone. */
  scale?: number
  delay?: number
  duration?: number
  /**
   * `view` animates when the element scrolls into view — correct for
   * everything below the fold. `mount` animates immediately, for content
   * already on screen at first paint (a hero), which would otherwise sit at
   * `initial` forever.
   */
  trigger?: 'view' | 'mount'
  /** Animate once and stay put, rather than replaying on every scroll-by. */
  once?: boolean
}

export default function Reveal({
  children,
  as = 'div',
  className,
  y,
  scale,
  delay,
  duration,
  trigger = 'view',
  once = false,
}: RevealProps) {
  const Element = ELEMENTS[as]

  const from = {
    opacity: 0,
    ...(y === undefined ? {} : { y }),
    ...(scale === undefined ? {} : { scale }),
  }

  const to = {
    opacity: 1,
    ...(y === undefined ? {} : { y: 0 }),
    ...(scale === undefined ? {} : { scale: 1 }),
  }

  const motionState =
    trigger === 'view'
      ? { whileInView: to, viewport: once ? { once: true } : undefined }
      : { animate: to }

  return (
    <Element
      className={className}
      initial={from}
      transition={{ delay, duration }}
      {...motionState}
    >
      {children}
    </Element>
  )
}
