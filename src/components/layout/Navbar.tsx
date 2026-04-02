'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import LanguageSwitcher from './LanguageSwitcher'

export default function Navbar() {
  const t = useTranslations('nav')
  const locale = useLocale()
  const pathname = usePathname()

  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const isHome = pathname === `/${locale}` || pathname === `/${locale}/`

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    { href: `/${locale}`, label: t('home') },
    { href: `/${locale}/products`, label: t('products') },
    { href: `/${locale}/our-story`, label: t('ourStory') },
    { href: `/${locale}/candle-care`, label: t('candleCare') },
    { href: `/${locale}/contact`, label: t('contact') },
  ]

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          isHome && !scrolled
            ? 'bg-transparent'
            : 'bg-cream-base border-b border-border'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">

          {/* Logo */}
          <Link
            href={`/${locale}`}
            className="text-lg md:text-xl font-semibold tracking-[0.3em] uppercase text-charcoal"
          >
            55CANDLES
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group relative text-xs tracking-widest uppercase text-ink-secondary hover:text-charcoal transition-colors duration-200"
              >
                {link.label}
                <span className="absolute left-0 -bottom-1 w-0 h-px bg-clay transition-all duration-300 group-hover:w-full" />
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-4">
            <LanguageSwitcher />

            {/* Burger */}
            <button
              onClick={() => setMenuOpen(true)}
              className="md:hidden flex flex-col gap-1.5 p-1"
              aria-label="Open menu"
            >
              <span className="block w-6 h-0.5 bg-charcoal" />
              <span className="block w-6 h-0.5 bg-charcoal" />
              <span className="block w-6 h-0.5 bg-charcoal" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-cream-base flex flex-col p-8"
          >
            {/* Close */}
            <button
              onClick={() => setMenuOpen(false)}
              className="self-end text-2xl text-charcoal mb-10"
            >
              ✕
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
                    onClick={() => setMenuOpen(false)}
                    className="text-2xl font-semibold tracking-widest uppercase text-ink-secondary hover:text-charcoal transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
            </nav>

            <div className="mt-auto flex justify-center">
              <LanguageSwitcher />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
