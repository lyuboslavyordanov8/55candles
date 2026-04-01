'use client'

import Link from 'next/link'
import { useLocale } from 'next-intl'
import { usePathname } from 'next/navigation'

export default function LanguageSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()

  function hrefFor(newLocale: string) {
    return pathname.replace(/^\/(en|bg)/, `/${newLocale}`)
  }

  return (
    <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase">
      <Link
        href={hrefFor('en')}
        className={
          locale === 'en'
            ? 'border-b-2 border-terracotta text-espresso'
            : 'text-espresso/50 hover:text-espresso transition-colors'
        }
      >
        EN
      </Link>
      <span className="text-espresso/30">|</span>
      <Link
        href={hrefFor('bg')}
        className={
          locale === 'bg'
            ? 'border-b-2 border-terracotta text-espresso'
            : 'text-espresso/50 hover:text-espresso transition-colors'
        }
      >
        BG
      </Link>
    </div>
  )
}
