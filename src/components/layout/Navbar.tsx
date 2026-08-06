import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import LanguageSwitcher from './LanguageSwitcher'
import MobileMenu from './MobileMenu'
import NavbarShell from './NavbarShell'
import { navLinks } from './nav-links'

// Burger bar colour follows the header's transparency, which NavbarShell
// publishes as data-transparent. Kept as a constant so the three bars and the
// server/client boundary can't drift apart.
const BURGER_BAR =
  'block w-6 h-0.5 transition-colors duration-300 bg-charcoal group-data-[transparent=true]:bg-cream-base'

// Server Component. Only NavbarShell (scroll state), MobileMenu (open state)
// and LanguageSwitcher (pathname) are client-side (AUDIT.md S-14).
export default function Navbar() {
  const t = useTranslations('nav')
  const locale = useLocale()

  const links = navLinks(locale, t)

  return (
    <NavbarShell homeHref={`/${locale}`}>
      {/* Logo */}
      <Link
        href={`/${locale}`}
        className="text-lg md:text-xl font-semibold tracking-[0.3em] uppercase transition-colors duration-300 text-charcoal group-data-[transparent=true]:text-cream-base"
      >
        55CANDLES
      </Link>

      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-8">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group/link relative text-xs tracking-widest uppercase transition-colors duration-200 text-ink-secondary hover:text-charcoal group-data-[transparent=true]:text-cream-base/80 group-data-[transparent=true]:hover:text-cream-base"
          >
            {link.label}
            <span className="absolute left-0 -bottom-1 w-0 h-px bg-clay transition-all duration-300 group-hover/link:w-full" />
          </Link>
        ))}
      </nav>

      {/* Right side */}
      <div className="flex items-center gap-4">
        <LanguageSwitcher />

        <MobileMenu
          links={links}
          languageSwitcher={<LanguageSwitcher />}
          labels={{
            open: t('openMenu'),
            close: t('closeMenu'),
            menu: t('menuLabel'),
          }}
          barClassName={BURGER_BAR}
        />
      </div>
    </NavbarShell>
  )
}
