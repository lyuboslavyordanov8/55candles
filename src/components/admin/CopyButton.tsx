'use client'

import { useState } from 'react'

/**
 * Tap-to-copy for the address block (order-management back office, UX
 * requirement: "one-tap copyable for pasting into the courier's own system").
 *
 * The only client-side JavaScript this admin loads beyond a plain form submit
 * — the Clipboard API has no server-side equivalent. Degrades to doing nothing
 * rather than throwing: a phone browser without clipboard permission, or an
 * insecure context, should not turn a copy button into a broken page.
 */
export default function CopyButton({ text, label = 'Копирай' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // No clipboard permission, no secure context, or no API at all. The
      // address is still on the screen to select by hand — nothing to recover.
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-sm border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:bg-stone-100"
    >
      <span aria-live="polite">{copied ? 'Копирано ✓' : label}</span>
    </button>
  )
}
