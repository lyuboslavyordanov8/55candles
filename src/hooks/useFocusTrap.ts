'use client'

import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Makes a modal container behave like a real dialog while `active`:
 *
 * - moves focus into the container on open
 * - cycles Tab / Shift+Tab within it instead of escaping to the page behind
 * - closes on Escape
 * - locks body scroll
 * - restores focus to whatever was focused before opening
 *
 * Returns the ref to attach to the container element.
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onClose: () => void
): RefObject<T | null> {
  const containerRef = useRef<T>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return

    previouslyFocused.current = document.activeElement as HTMLElement | null

    const container = containerRef.current
    if (!container) return

    // Focus the first focusable child, falling back to the container itself.
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )

    const first = focusables()[0]
    if (first) first.focus()
    else container.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        return
      }

      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      const activeEl = document.activeElement

      if (event.shiftKey && activeEl === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && activeEl === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    // Lock scroll without the layout shift that removing the scrollbar causes.
    const { overflow, paddingRight } = document.body.style
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
      previouslyFocused.current?.focus()
    }
  }, [active, onClose])

  return containerRef
}
