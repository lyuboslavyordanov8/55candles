'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import MaterialIcon from '@/components/icons/MaterialIcon'
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
}

/**
 * The menu panel — dialog semantics, focus trap and open/close state.
 *
 * Named "mobile" for historical reasons: it is now the only navigation at every
 * breakpoint, since the redesign moved the wordmark to the centre of the bar
 * and there is no room for a row of links beside it.
 *
 * Split out of `Navbar` so the button and the overlay are the only part of the
 * header that ships to the client (AUDIT.md S-14). The nav links are computed
 * on the server and handed over as plain data.
 */
export default function MobileMenu({ links, languageSwitcher, labels }: Props) {
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
        className="p-1 text-ink-primary transition-opacity duration-200 hover:opacity-60"
        aria-label={labels.open}
        aria-expanded={menuOpen}
        aria-controls={MENU_ID}
      >
        <MaterialIcon name="menu" className="h-5 w-5" />
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
            className="fixed inset-0 z-[60] bg-paper-white flex flex-col p-8"
          >
            {/* Close */}
            <button
              onClick={closeMenu}
              aria-label={labels.close}
              className="self-end mb-10 p-1 text-ink-primary transition-opacity duration-200 hover:opacity-60"
            >
              <MaterialIcon name="close" className="h-6 w-6" />
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
                    className="text-2xl font-semibold tracking-widest uppercase text-ink-secondary hover:text-ink-primary transition-colors duration-200"
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
