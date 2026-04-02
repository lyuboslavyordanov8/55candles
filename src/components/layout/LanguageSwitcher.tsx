'use client'

import Link from 'next/link'
import { useLocale } from 'next-intl'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'

export default function LanguageSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()

  function hrefFor(newLocale: string) {
    return pathname.replace(/^\/(en|bg)/, `/${newLocale}`)
  }

  const languages = [
    { code: 'en', label: 'EN' },
    { code: 'bg', label: 'BG' },
  ]

  return (
    <div className="relative flex items-center bg-white/5 backdrop-blur-md rounded-full p-1 border border-white/10">

      {/* 🔥 Sliding active background */}
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="absolute top-1 bottom-1 w-1/2 rounded-full bg-white shadow-sm"
        style={{
          left: locale === 'en' ? '4px' : 'calc(50% - 4px)',
        }}
      />

      {languages.map((lang) => {
        const isActive = locale === lang.code

        return (
          <Link
            key={lang.code}
            href={hrefFor(lang.code)}
            className="relative z-10 px-4 py-1.5 text-xs font-semibold tracking-widest uppercase transition-colors"
          >
            <span
              className={
                isActive
                  ? 'text-black'
                  : 'text-white/50 hover:text-white'
              }
            >
              {lang.label}
            </span>
          </Link>
        )
      })}
    </div>
  )
}