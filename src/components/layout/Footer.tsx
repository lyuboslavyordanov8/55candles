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
    <footer className="bg-sand border-t border-espresso/10 py-16 px-6">
      <div className="max-w-7xl mx-auto flex flex-col items-center gap-8">
        <span className="text-xl font-bold tracking-widest uppercase text-espresso">
          55CANDLES
        </span>

        <nav className="flex flex-wrap justify-center gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs font-semibold tracking-widest uppercase text-espresso/60 hover:text-terracotta transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <a
          href="https://instagram.com/55candles"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          className="text-espresso/60 hover:text-terracotta transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
          </svg>
        </a>

        <LanguageSwitcher />

        <p className="text-xs text-espresso/40">
          © {new Date().getFullYear()} 55candles. {tf('rights')}.
        </p>
      </div>
    </footer>
  )
}
