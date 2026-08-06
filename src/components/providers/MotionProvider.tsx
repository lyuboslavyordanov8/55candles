'use client'

import { MotionConfig } from 'framer-motion'

/**
 * framer-motion animates through inline styles, so the
 * `prefers-reduced-motion` block in globals.css cannot reach it.
 * `reducedMotion="user"` makes it honour the OS setting: transform and
 * layout animations are skipped, while opacity crossfades are kept (they do
 * not cause vestibular discomfort).
 */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
