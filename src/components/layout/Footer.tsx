'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
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
    <footer className="relative overflow-hidden bg-[#0a0a0a] text-white py-20 px-6">

      {/* 🔥 Ambient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,180,100,0.15),transparent_60%)] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto flex flex-col items-center gap-10">

        {/* Brand */}
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="text-2xl font-semibold tracking-[0.3em] uppercase text-white"
        >
          55CANDLES
        </motion.span>

        {/* Nav */}
        <nav className="flex flex-wrap justify-center gap-8">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative text-xs tracking-widest uppercase text-white/50 hover:text-white transition-colors"
            >
              <span className="relative z-10">{link.label}</span>

              {/* 🔥 underline glow */}
              <span className="absolute left-0 -bottom-1 w-0 h-px bg-white/70 transition-all duration-300 group-hover:w-full" />
            </Link>
          ))}
        </nav>

        {/* Instagram */}
        <motion.a
          href="https://instagram.com/55candles"
          target="_blank"
          rel="noopener noreferrer"
          whileHover={{ scale: 1.15 }}
          className="text-white/50 hover:text-white transition"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069z" />
          </svg>
        </motion.a>

        {/* Language */}
        <LanguageSwitcher />

        {/* Divider */}
        <div className="w-full max-w-md h-px bg-white/10" />

        {/* Copyright */}
        <p className="text-xs text-white/30 text-center">
          © {new Date().getFullYear()} 55candles. {tf('rights')}.
        </p>
      </div>
    </footer>
  )
}