'use client'

import Link from 'next/link'
import { useLocale } from 'next-intl'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'

/**
 * Language control: a compact one-tap toggle on phones, the sliding EN/BG pill
 * from `md` up.
 *
 * Both are always in the DOM and CSS picks one, so there is no layout shift and
 * no client-side width measuring. `display: none` also removes the hidden one
 * from the accessibility tree, so screen readers announce a single control.
 *
 * The two-language pill is 88px wide, which does not fit beside the cart in the
 * header's side track on a 375px screen — the group overflowed and pushed the
 * cart off the edge. Hiding the switcher entirely on mobile was the first fix
 * and the wrong one: it left language choice buried at the foot of the menu
 * panel on a site that is Bulgarian-first with an English translation. The
 * compact toggle is 46px and fits with room to spare.
 */
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

  // The compact toggle shows where it takes you, not where you are.
  const target = locale === 'bg' ? languages[0] : languages[1]

  // Hardcoded rather than read from the catalogue: this is a Client Component,
  // and pulling in `useTranslations` would mean adding `nav` to
  // CLIENT_NAMESPACES, which ships every navigation string to the browser for
  // two words (see src/i18n/client-namespaces.ts). The EN/BG labels below are
  // hardcoded for the same reason. Each label is written in the language it
  // switches *to*, which is the convention for language pickers.
  const switchLabel = target.code === 'bg' ? 'Превключи на български' : 'Switch to English'

  return (
    <>
      {/* Compact, phones only */}
      <Link
        href={hrefFor(target.code)}
        aria-label={switchLabel}
        className="rounded-full border border-border bg-cream-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-ink-primary transition-opacity duration-200 hover:opacity-70 md:hidden"
      >
        {target.label}
      </Link>

      {/* Full pill, md and up */}
      <div className="relative hidden items-center bg-cream-muted rounded-full p-1 border border-border md:flex">

      {/* Sliding active background */}
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        // `shadow-clay/20` overrides Tailwind's default shadow colour, which is
        // black at 10%. On cream that reads as a grey smudge; tinting it with
        // the palette's brown keeps the pill warm — and it was the last black
        // left in the compiled stylesheet.
        className="absolute top-1 bottom-1 w-1/2 rounded-full bg-cream-base shadow-sm shadow-clay/20"
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
            <span className={isActive ? 'text-charcoal' : 'text-ink-ghost hover:text-charcoal'}>
              {lang.label}
            </span>
          </Link>
        )
      })}
      </div>
    </>
  )
}