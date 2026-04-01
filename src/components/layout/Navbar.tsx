'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
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

  const isTransparent = isHome && !scrolled

  const links = [
    { href: `/${locale}`, label: t('home') },
    { href: `/${locale}/products`, label: t('products') },
    { href: `/${locale}/our-story`, label: t('ourStory') },
    { href: `/${locale}/candle-care`, label: t('candleCare') },
    { href: `/${locale}/contact`, label: t('contact') },
  ]

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        isTransparent ? 'bg-transparent' : 'bg-cream shadow-sm'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link
          href={`/${locale}`}
          className="text-xl font-bold tracking-widest uppercase text-espresso"
        >
          55CANDLES
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs font-semibold tracking-widest uppercase text-espresso hover:text-terracotta transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <button
            className="md:hidden flex flex-col gap-1.5 p-1"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <span className="block w-6 h-0.5 bg-espresso" />
            <span className="block w-6 h-0.5 bg-espresso" />
            <span className="block w-6 h-0.5 bg-espresso" />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-cream flex flex-col p-8">
          <button
            onClick={() => setMenuOpen(false)}
            className="self-end text-2xl text-espresso mb-8"
            aria-label="Close menu"
          >
            ✕
          </button>
          <nav className="flex flex-col gap-8">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="text-2xl font-bold tracking-widest uppercase text-espresso"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto">
            <LanguageSwitcher />
          </div>
        </div>
      )}
    </header>
  )
}
