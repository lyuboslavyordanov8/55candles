'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Owns the only two pieces of client state in the header: whether the page is
 * scrolled, and whether we are on the homepage (where the navbar sits over the
 * hero image and must go transparent).
 *
 * It publishes that state as `data-transparent` on the `<header>` rather than
 * computing class names for its children. That is what lets the logo, the
 * desktop nav and the burger stay Server Components — they carry static
 * `group-data-[transparent=true]:…` classes and CSS resolves the rest
 * (AUDIT.md S-14). Passing class names down instead would have forced every
 * child back across the boundary.
 */
export default function NavbarShell({
  children,
  homeHref,
}: {
  children: React.ReactNode
  /** The locale root, e.g. `/en`. Transparency only applies there. */
  homeHref: string
}) {
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()

  const isHome = pathname === homeHref || pathname === `${homeHref}/`

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const transparent = isHome && !scrolled

  return (
    <header
      data-transparent={transparent}
      className={`group fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        transparent ? 'bg-transparent' : 'bg-cream-base border-b border-border'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {children}
      </div>
    </header>
  )
}
