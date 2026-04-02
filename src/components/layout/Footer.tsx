'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import LanguageSwitcher from './LanguageSwitcher'

export default function Footer() {
  const t = useTranslations('nav')
  const tf = useTranslations('footer')
  const locale = useLocale()

  const links = [
    { href: `/${locale}`, label: t('home') },
    { href: `/${locale}/products`, label: t('products') },
    { href: `/${locale}/our-story`, label: t('ourStory') },
    { href: `/${locale}/candle-care`, label: t('candleCare') },
    { href: `/${locale}/contact`, label: t('contact') },
  ]

  return (
    <footer className="bg-cream-base border-t border-border py-20 px-6">
      <div className="max-w-7xl mx-auto flex flex-col items-center gap-10">

        {/* Brand */}
        <span className="text-2xl font-semibold tracking-[0.3em] uppercase text-charcoal">
          55CANDLES
        </span>

        {/* Nav */}
        <nav className="flex flex-wrap justify-center gap-8">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs tracking-widest uppercase text-ink-ghost hover:text-charcoal transition-colors duration-200"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Instagram */}
        <a
          href="https://instagram.com/55candles"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          className="text-ink-ghost hover:text-charcoal transition-colors duration-200"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069z" />
          </svg>
        </a>

        {/* Language */}
        <LanguageSwitcher />

        {/* Divider */}
        <div className="w-full max-w-md h-px bg-border" />

        {/* Copyright */}
        <p className="text-xs text-ink-ghost text-center">
          © {new Date().getFullYear()} 55candles. {tf('rights')}.
        </p>
      </div>
    </footer>
  )
}
