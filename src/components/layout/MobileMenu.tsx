'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import type { NavLink } from './nav-links'

const MENU_ID = 'mobile-menu'

interface Props {
  links: NavLink[]
  /** Rendered inside the open dialog, at the bottom. */
  languageSwitcher: React.ReactNode
  labels: {
    open: string
    close: string
    menu: string
  }
  /**
   * Burger bar colour. The navbar goes transparent over the homepage hero, so
   * the bars have to invert with it — but `isHome`/`scrolled` live in the
   * server shell, which passes the resolved class down.
   */
  barClassName: string
}

/**
 * The mobile menu — dialog semantics, focus trap and open/close state.
 *
 * Split out of `Navbar` so the burger and the overlay are the only part of the
 * header that ships to the client (AUDIT.md S-14). The nav links are computed
 * on the server and handed over as plain data.
 */
export default function MobileMenu({
  links,
  languageSwitcher,
  labels,
  barClassName,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const menuRef = useFocusTrap<HTMLDivElement>(menuOpen, closeMenu)

  // Close the menu when a navigation actually happens.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  return (
    <>
      <button
        onClick={() => setMenuOpen(true)}
        className="md:hidden flex flex-col gap-1.5 p-1"
        aria-label={labels.open}
        aria-expanded={menuOpen}
        aria-controls={MENU_ID}
      >
        <span className={barClassName} />
        <span className={barClassName} />
        <span className={barClassName} />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            ref={menuRef}
            id={MENU_ID}
            role="dialog"
            aria-modal="true"
            aria-label={labels.menu}
            tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-cream-base flex flex-col p-8"
          >
            {/* Close */}
            <button
              onClick={closeMenu}
              aria-label={labels.close}
              className="self-end text-2xl text-charcoal mb-10"
            >
              <span aria-hidden="true">✕</span>
            </button>

            {/* Links */}
            <nav className="flex flex-col gap-8 items-center mt-10">
              {links.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={link.href}
                    onClick={closeMenu}
                    className="text-2xl font-semibold tracking-widest uppercase text-ink-secondary hover:text-charcoal transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
            </nav>

            <div className="mt-auto flex justify-center">{languageSwitcher}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
