import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import LanguageSwitcher from './LanguageSwitcher'
import Impressum from '@/components/legal/Impressum'
import { LEGAL_DOCS, legalPath } from '@/lib/legal'
import { navLinks } from './nav-links'

/**
 * The footer, on the same sand as the announcement bar so the two bracket the
 * white page, ending on the oversized "Повече от свещи" wordmark.
 *
 * **Text colours here are constrained.** On sand, `clay` lands at 4.32:1 and
 * `ink-ghost` at 4.34:1 — both under the 4.5:1 AA floor for body text. Only
 * `ink-primary` (11.48:1) and `ink-secondary` (5.79:1) may be used, which is
 * why the links below are secondary rather than the ghost used elsewhere.
 * `src/__tests__/contrast.test.ts` enforces this.
 *
 * Server Component: nothing here is interactive. The only client-side piece is
 * LanguageSwitcher, which needs the current pathname (AUDIT.md S-14).
 */
export default function Footer() {
  const t = useTranslations('nav')
  const tf = useTranslations('footer')
  const tl = useTranslations('legal')
  const locale = useLocale()

  const links = navLinks(locale, t)

  return (
    <footer className="bg-brand-sand pt-20">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-10 px-6">
        {/* Nav */}
        <nav className="flex flex-wrap justify-center gap-x-8 gap-y-4">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs uppercase tracking-widest text-ink-secondary transition-colors duration-200 hover:text-ink-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Social */}
        <div className="flex flex-col items-center gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-primary">
            {tf('followUs')}
          </p>

          <a
            href="https://www.instagram.com/55candles.bg/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="text-ink-primary transition-opacity duration-200 hover:opacity-60"
          >
            {/*
              Instagram's own glyph, not a Material Symbol — Material has no
              brand icons. Drawn as the rounded square, lens and flash dot.
            */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <rect x="2" y="2" width="20" height="20" rx="5.5" />
              <circle cx="12" cy="12" r="4.2" />
              <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
            </svg>
          </a>
        </div>

        <LanguageSwitcher />

        <div className="h-px w-full max-w-md bg-ink-primary/15" />

        {/*
          Legal documents must be reachable from every page (AUDIT.md B-15), so
          they live here rather than in the main nav.
        */}
        <nav
          aria-label={locale === 'bg' ? 'Правни документи' : 'Legal'}
          className="flex flex-wrap justify-center gap-x-6 gap-y-3"
        >
          {LEGAL_DOCS.map((doc) => (
            <Link
              key={doc.slug}
              href={legalPath(locale, doc.slug)}
              className="text-xs uppercase tracking-widest text-ink-secondary transition-colors duration-200 hover:text-ink-primary"
            >
              {tl(`docs.${doc.key}.title`)}
            </Link>
          ))}
        </nav>

        {/* Copyright + trader identification (AUDIT.md B-16) */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-center text-xs text-ink-secondary">
            © {new Date().getFullYear()} 55CANDLES. {tf('rights')}.
          </p>

          <Impressum locale={locale} />
        </div>
      </div>

      <SignOff text={tf('signOff')} />
    </footer>
  )
}

/**
 * The oversized sign-off across the bottom of the footer.
 *
 * Drawn as SVG text rather than an `<h2>` with a `vw` font size. The effect
 * only works if the words span the full width, and the two locales are
 * different lengths — "Повече от свещи" against "More than candles" — so any
 * single font size fits one and clips or strands the other. `textLength` pins
 * the drawn width to the viewBox instead, and the SVG scales to whatever the
 * viewport is.
 *
 * `fontSize` is pre-set close to the natural width for the given string, so
 * `lengthAdjust` only has to nudge it; that keeps the letterforms from visibly
 * stretching. 0.68 is roughly Montserrat SemiBold's average advance per
 * uppercase character in ems — an approximation, and it only needs to be close.
 */
function SignOff({ text }: { text: string }) {
  const fontSize = Math.round(980 / Math.max(text.length * 0.68, 1))
  const height = Math.round(fontSize * 0.78)

  return (
    <svg
      viewBox={`0 0 1000 ${height}`}
      role="img"
      aria-label={text}
      className="mt-16 block w-full select-none"
    >
      <text
        x="500"
        y={height}
        textAnchor="middle"
        textLength="980"
        lengthAdjust="spacingAndGlyphs"
        fontSize={fontSize}
        className="fill-ink-primary font-sans font-semibold uppercase"
      >
        {text}
      </text>
    </svg>
  )
}
