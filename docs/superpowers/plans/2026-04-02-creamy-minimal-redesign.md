# Creamy Minimal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark glassmorphism theme with a warm, editorial cream aesthetic across all 15 components — Playfair Display headings, clay accent, no glows.

**Architecture:** Clean-break approach — delete all dark values and glassmorphism in one pass. New design tokens live in `tailwind.config.ts` (colors + serif font family). Font loaded via `next/font/google` in `layout.tsx`. No theme toggle, no legacy styles.

**Tech Stack:** Next.js 16 app router, React 19, Tailwind CSS v4 (compat config), Framer Motion, next-intl, Vitest + Testing Library

---

## File Map

| File | Change |
|---|---|
| `tailwind.config.ts` | Replace color tokens, add `font-serif` |
| `src/app/[locale]/layout.tsx` | Load Playfair Display, remove CursorGlow, update body classes |
| `src/app/globals.css` | No change needed |
| `src/components/layout/LanguageSwitcher.tsx` | Replace glassmorphism pill with cream pill |
| `src/components/layout/Navbar.tsx` | Light cream nav, clay underline, light mobile menu |
| `src/components/home/Hero.tsx` | Full rewrite — editorial text-only hero, remove photo/glows |
| `src/components/home/BrandValues.tsx` | Cream bg, clay icons, remove glow |
| `src/components/home/ScentGrid.tsx` | Cream bg, serif heading, remove glow |
| `src/components/products/ProductCard.tsx` | Warm Float card — remove glassmorphism, serif name, clay CTA |
| `src/components/home/StoryTeaser.tsx` | Cream bg, serif heading, remove dark overlay |
| `src/components/home/Testimonials.tsx` | Cream surface cards, remove glassmorphism/glow |
| `src/components/home/CandleCareTeaser.tsx` | Cream bg, clay icons, remove glassmorphism |
| `src/components/home/CtaBanner.tsx` | Charcoal bg (dark rhythm break), clay CTA, remove orange glow |
| `src/components/layout/Footer.tsx` | Cream bg, remove glow |
| `src/app/[locale]/products/page.tsx` | Cream bg, serif heading |
| `src/app/[locale]/products/[slug]/page.tsx` | Cream bg, light image container, remove per-product glow |
| `src/components/products/__tests__/ProductCard.test.tsx` | Update className assertion that checks `text-white` |

---

## Task 1: Update Design Tokens in tailwind.config.ts

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Replace the config**

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          base: '#F6F1EB',
          surface: '#FAF7F3',
          muted: '#EDE5DC',
        },
        charcoal: '#2B2B2B',
        clay: '#8B6F4E',
        border: '#DDD4C8',
        ink: {
          primary: '#2B2B2B',
          secondary: '#7A7065',
          ghost: '#9B8E82',
        },
        scent: {
          cherry: '#e83a3a',
          orange: '#f07020',
          vanilla: '#c8a040',
          strawberry: '#e8408a',
          espresso: '#4a2a18',
          winter: '#7a9ab8',
        },
      },
      fontFamily: {
        sans: ['var(--font-montserrat)', 'sans-serif'],
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 2: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat: add cream/clay/charcoal design tokens and serif font family"
```

---

## Task 2: Load Playfair Display + Remove GlowingCursor from Layout

**Files:**
- Modify: `src/app/[locale]/layout.tsx`

- [ ] **Step 1: Run existing tests to establish baseline**

```bash
cd "C:/Users/White Hat Gaming/55candles" && npx vitest run
```

Expected: all tests pass (green baseline before any changes)

- [ ] **Step 2: Replace layout.tsx**

```tsx
import type { Metadata } from 'next'
import { Montserrat, Playfair_Display } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'

import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'

import '../globals.css'

const montserrat = Montserrat({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-montserrat',
  display: 'swap',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
})

const descriptions: Record<string, string> = {
  en: 'Eco-friendly, non-toxic candles with hand-sculpted wax fruit. No nasties, ever.',
  bg: 'Екологични, нетоксични свещи с ръчно изработени плодове от восък. Без вредни съставки, никога.',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params

  return {
    title: '55candles',
    description: descriptions[locale] ?? descriptions.en,
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const messages = await getMessages()

  return (
    <html lang={locale} className={`${montserrat.variable} ${playfair.variable}`}>
      <body className="bg-cream-base text-charcoal font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          <Navbar />
          <main>{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Run tests — expect all to pass**

```bash
npx vitest run
```

Expected: all tests pass (layout change doesn't affect component tests)

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/layout.tsx
git commit -m "feat: load Playfair Display, set cream body background, remove GlowingCursor"
```

---

## Task 3: LanguageSwitcher — Light Pill

**Files:**
- Modify: `src/components/layout/LanguageSwitcher.tsx`

- [ ] **Step 1: Replace the component**

```tsx
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
    <div className="relative flex items-center bg-cream-muted rounded-full p-1 border border-border">

      {/* Sliding active background */}
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="absolute top-1 bottom-1 w-1/2 rounded-full bg-cream-base shadow-sm"
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
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run
```

Expected: all pass (Navbar tests render LanguageSwitcher — verify EN/BG still present)

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/LanguageSwitcher.tsx
git commit -m "feat: light pill style for language switcher"
```

---

## Task 4: Navbar — Light Cream

**Files:**
- Modify: `src/components/layout/Navbar.tsx`

- [ ] **Step 1: Replace the component**

```tsx
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
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/components/layout/__tests__/Navbar.test.tsx
```

Expected: 3 tests pass — brand name, nav links, language switcher still render

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Navbar.tsx
git commit -m "feat: light cream navbar with clay hover underlines"
```

---

## Task 5: Hero — Pure Editorial Text

**Files:**
- Modify: `src/components/home/Hero.tsx`

- [ ] **Step 1: Replace the component**

```tsx
'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export default function Hero({ locale }: Props) {
  const t = useTranslations('hero')

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-cream-base overflow-hidden">

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-3xl mx-auto">

        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-center gap-4 mb-8"
        >
          <span className="block w-10 h-px bg-border" />
          <span className="text-[10px] tracking-[0.35em] uppercase text-ink-ghost">
            Handcrafted in Sofia
          </span>
          <span className="block w-10 h-px bg-border" />
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="font-serif text-5xl md:text-7xl font-normal tracking-tight leading-snug mb-8 text-charcoal"
        >
          {t('headline').split(' ').slice(0, -1).join(' ')}{' '}
          <em className="text-clay">
            {t('headline').split(' ').slice(-1)[0]}
          </em>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-base md:text-lg leading-relaxed mb-12 text-ink-secondary max-w-xl mx-auto"
        >
          {t('subtext')}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
          className="flex items-center justify-center gap-8"
        >
          <Link
            href={`/${locale}/products`}
            className="inline-flex items-center justify-center px-8 py-3 bg-charcoal text-cream-base text-xs font-medium tracking-widest uppercase rounded-sm hover:bg-clay transition-colors duration-300"
          >
            {t('cta')}
          </Link>

          <Link
            href={`/${locale}/our-story`}
            className="text-xs tracking-widest uppercase text-clay border-b border-clay pb-0.5 hover:opacity-70 transition-opacity duration-200"
          >
            Our story →
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run
```

Expected: all pass (Hero has no dedicated unit tests; homepage integration test checks page renders)

- [ ] **Step 3: Commit**

```bash
git add src/components/home/Hero.tsx
git commit -m "feat: editorial text-only hero — Playfair headline, cream bg, no photo"
```

---

## Task 6: BrandValues — Cream Surface, Clay Icons

**Files:**
- Modify: `src/components/home/BrandValues.tsx`

- [ ] **Step 1: Replace the component**

```tsx
'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

const LeafIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  </svg>
)

const ShieldCheckIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
)

const SparkleIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
  </svg>
)

export default function BrandValues() {
  const t = useTranslations('values')

  const values = [
    { Icon: LeafIcon, label: t('eco') },
    { Icon: ShieldCheckIcon, label: t('nonToxic') },
    { Icon: SparkleIcon, label: t('fruit') },
  ]

  return (
    <section className="py-20 px-6 bg-cream-surface border-y border-border">
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
        {values.map((v, i) => (
          <motion.div
            key={v.label}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex flex-col items-center text-center gap-4 p-6"
          >
            <div className="text-clay transition-opacity duration-300 hover:opacity-70">
              <v.Icon />
            </div>
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-ink-secondary">
              {v.label}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/components/home/BrandValues.tsx
git commit -m "feat: light cream brand values section, uniform clay icons"
```

---

## Task 7: ScentGrid — Cream Background, Serif Heading

**Files:**
- Modify: `src/components/home/ScentGrid.tsx`

- [ ] **Step 1: Replace the component**

```tsx
'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import ProductCard from '@/components/products/ProductCard'
import { products } from '@/data/products'

interface Props { locale: string }

export default function ScentGrid({ locale }: Props) {
  const t = useTranslations('collection')

  return (
    <section className="py-28 px-6 bg-cream-base">
      <div className="max-w-7xl mx-auto">

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-serif text-3xl md:text-5xl font-normal text-charcoal mb-3">
            {t('title')}
          </h2>
          <p className="text-ink-ghost text-sm max-w-md mx-auto">
            Choose your mood. Each scent is crafted to transform your space.
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
          {products.map((product, i) => (
            <motion.div
              key={product.slug}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <ProductCard product={product} locale={locale} />
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/components/home/ScentGrid.tsx
git commit -m "feat: cream background and serif heading for scent grid"
```

---

## Task 8: ProductCard — Warm Float Style

**Files:**
- Modify: `src/components/products/ProductCard.tsx`
- Modify: `src/components/products/__tests__/ProductCard.test.tsx`

- [ ] **Step 1: Update the failing test assertion first**

The existing test at line 56 checks `el.className.includes('text-white')` for the seasonal overlay — this will no longer be true after the refactor. Update the test to check for the new class.

In `src/components/products/__tests__/ProductCard.test.tsx`, replace the `'shows out-of-season overlay'` test:

```tsx
it('shows out-of-season overlay when seasonal product is inactive', () => {
  renderCard(winter) // winter.seasonal.active = false
  const seasonalSpans = screen.getAllByText(/seasonal/i)
  const overlaySpan = seasonalSpans.find((el) => el.tagName === 'SPAN' && !el.className.includes('top-3'))
  expect(overlaySpan).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests — expect the updated test to still pass with current code**

```bash
npx vitest run src/components/products/__tests__/ProductCard.test.tsx
```

Expected: all 5 ProductCard tests pass (the updated assertion is compatible with current code too)

- [ ] **Step 3: Replace ProductCard.tsx**

```tsx
'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { Product } from '@/types/product'

interface Props {
  product: Product
  locale: string
}

export default function ProductCard({ product, locale }: Props) {
  const t = useTranslations('collection')

  const isOutOfSeason = product.seasonal !== null && !product.seasonal.active
  const [hoverLoaded, setHoverLoaded] = useState(false)

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="group"
    >
      {/* Card */}
      <div className="rounded-sm bg-cream-surface overflow-hidden">

        {/* IMAGE */}
        <div className="relative aspect-square overflow-hidden">

          {/* Base image */}
          <Image
            src={product.imagePath}
            alt={product.name}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 33vw"
            className={`object-cover transition duration-500 ease-out will-change-transform
              ${product.hoverImagePath && hoverLoaded
                ? 'group-hover:opacity-0 group-hover:scale-[1.04]'
                : 'group-hover:scale-[1.04]'
              }
            `}
          />

          {/* Hover image */}
          {product.hoverImagePath && (
            <Image
              src={product.hoverImagePath}
              alt={product.name}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 33vw"
              onLoad={() => setHoverLoaded(true)}
              className="object-cover opacity-0 group-hover:opacity-100 transition duration-500 ease-out will-change-opacity"
            />
          )}

          {/* Highlight badge */}
          {product.highlight && (
            <span className="absolute top-3 left-3 text-[10px] font-medium tracking-wide uppercase px-3 py-1 rounded-full bg-cream-base text-charcoal">
              {product.highlight}
            </span>
          )}

          {/* Seasonal overlay */}
          {isOutOfSeason && (
            <div className="absolute inset-0 bg-cream-base/80 flex items-center justify-center backdrop-blur-sm">
              <span className="text-ink-secondary text-xs tracking-wide uppercase">
                {t('seasonal')}
              </span>
            </div>
          )}
        </div>

        {/* CONTENT */}
        <div className="p-5 space-y-3">

          {/* Title */}
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-lg font-normal text-charcoal">
              {product.name}
            </h3>
          </div>

          {/* Descriptor */}
          <p className="text-sm text-ink-secondary leading-relaxed">
            {product.descriptor}
          </p>

          {/* Mood */}
          <p className="text-[10px] uppercase tracking-wide text-ink-ghost">
            {product.mood}
          </p>

          {/* Divider */}
          <div className="h-px w-full bg-border" />

          {/* CTA */}
          <Link
            href={`/${locale}/products/${product.slug}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium tracking-wide uppercase text-clay border-b border-clay pb-0.5 hover:opacity-70 transition-opacity duration-200"
          >
            {t('learnMore')}
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass — product name, descriptor, link href, highlight badge, seasonal overlay all present

- [ ] **Step 5: Commit**

```bash
git add src/components/products/ProductCard.tsx src/components/products/__tests__/ProductCard.test.tsx
git commit -m "feat: warm float product card — cream surface, serif name, clay CTA, no glassmorphism"
```

---

## Task 9: StoryTeaser — Muted Cream, Remove Dark Overlay

**Files:**
- Modify: `src/components/home/StoryTeaser.tsx`

- [ ] **Step 1: Replace the component**

```tsx
'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export default function StoryTeaser({ locale }: Props) {
  const t = useTranslations('storyTeaser')

  return (
    <section className="py-28 px-6 bg-cream-muted">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">

        {/* Image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="relative aspect-square rounded-sm overflow-hidden"
        >
          <Image
            src="/images/story.jpg"
            alt="55candles story"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </motion.div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col gap-6"
        >
          <h2 className="font-serif text-3xl md:text-4xl font-normal leading-snug text-charcoal">
            {t('headline')}
          </h2>

          <p className="text-base text-ink-secondary leading-relaxed max-w-md">
            {t('body')}
          </p>

          <Link
            href={`/${locale}/our-story`}
            className="inline-flex items-center gap-2 text-xs font-medium tracking-widest uppercase text-clay border-b border-clay pb-0.5 w-fit hover:opacity-70 transition-opacity duration-200"
          >
            {t('cta')} →
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/components/home/StoryTeaser.tsx
git commit -m "feat: muted cream story teaser, remove dark overlay, serif heading"
```

---

## Task 10: Testimonials — Cream Cards, Remove Glassmorphism

**Files:**
- Modify: `src/components/home/Testimonials.tsx`

- [ ] **Step 1: Replace the component**

```tsx
'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

const StarIcon = () => (
  <svg className="w-4 h-4 fill-clay text-clay" viewBox="0 0 24 24">
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
  </svg>
)

const Stars = () => (
  <div className="flex gap-0.5">
    {Array.from({ length: 5 }).map((_, i) => <StarIcon key={i} />)}
  </div>
)

interface Review {
  nameKey: '1name' | '2name' | '3name'
  textKey: '1text' | '2text' | '3text'
}

const reviews: Review[] = [
  { nameKey: '1name', textKey: '1text' },
  { nameKey: '2name', textKey: '2text' },
  { nameKey: '3name', textKey: '3text' },
]

export default function Testimonials() {
  const t = useTranslations('testimonials')

  return (
    <section className="py-28 px-6 bg-cream-surface">
      <div className="max-w-7xl mx-auto">

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="font-serif text-3xl md:text-5xl font-normal text-center text-charcoal mb-16"
        >
          {t('title')}
        </motion.h2>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {reviews.map((review, i) => (
            <motion.div
              key={review.nameKey}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="p-8 bg-cream-base border border-border rounded-sm flex flex-col gap-5"
            >
              <Stars />

              <p className="text-base text-ink-secondary leading-relaxed italic flex-1 font-serif">
                &ldquo;{t(review.textKey)}&rdquo;
              </p>

              <p className="text-sm font-medium tracking-wide text-charcoal">
                {t(review.nameKey)}
                <span className="font-normal text-ink-ghost ml-2 tracking-normal">
                  · Verified buyer
                </span>
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/components/home/Testimonials.tsx
git commit -m "feat: cream testimonial cards, clay stars, remove glassmorphism"
```

---

## Task 11: CandleCareTeaser — Cream Background, Clay Icons

**Files:**
- Modify: `src/components/home/CandleCareTeaser.tsx`

- [ ] **Step 1: Replace the component**

```tsx
'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

const FlameIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
)

const ScissorsIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
)

const ClockIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

const SnowflakeIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </svg>
)

interface Props { locale: string }

const tips = [
  { Icon: FlameIcon, titleKey: 'tip1Title', bodyKey: 'tip1Body' },
  { Icon: ScissorsIcon, titleKey: 'tip2Title', bodyKey: 'tip2Body' },
  { Icon: ClockIcon, titleKey: 'tip3Title', bodyKey: 'tip3Body' },
  { Icon: SnowflakeIcon, titleKey: 'tip4Title', bodyKey: 'tip4Body' },
] as const

export default function CandleCareTeaser({ locale }: Props) {
  const t = useTranslations('candleCareSection')

  return (
    <section className="py-28 px-6 bg-cream-base">
      <div className="max-w-7xl mx-auto">

        {/* Title */}
        <h2 className="font-serif text-3xl md:text-4xl font-normal text-center text-charcoal mb-16">
          {t('title')}
        </h2>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-14">
          {tips.map((tip, i) => (
            <motion.div
              key={tip.titleKey}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="p-6 bg-cream-surface border border-border rounded-sm text-center"
            >
              <div className="text-clay mb-3 flex justify-center">
                <tip.Icon />
              </div>

              <h3 className="text-xs font-semibold tracking-widest uppercase text-charcoal mb-2">
                {t(tip.titleKey)}
              </h3>

              <p className="text-sm text-ink-secondary leading-relaxed">
                {t(tip.bodyKey)}
              </p>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href={`/${locale}/candle-care`}
            className="inline-flex items-center gap-2 text-xs font-medium tracking-widest uppercase text-clay border-b border-clay pb-0.5 hover:opacity-70 transition-opacity duration-200"
          >
            {t('cta')} →
          </Link>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/components/home/CandleCareTeaser.tsx
git commit -m "feat: cream candle care section, clay icons, remove glassmorphism"
```

---

## Task 12: CtaBanner — Charcoal Dark Break, Clay CTA

**Files:**
- Modify: `src/components/home/CtaBanner.tsx`

- [ ] **Step 1: Replace the component**

```tsx
'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export default function CtaBanner({ locale }: Props) {
  const t = useTranslations('ctaBanner')

  return (
    <section className="py-32 px-6 bg-charcoal">
      <div className="max-w-3xl mx-auto text-center">

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="font-serif text-4xl md:text-6xl font-normal leading-snug mb-6 text-cream-base"
        >
          {t('headline')}
        </motion.h2>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-base text-cream-base/55 tracking-wide mb-12"
        >
          {t('sub')}
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Link
            href={`/${locale}/products`}
            className="inline-flex items-center justify-center px-10 py-4 bg-clay text-cream-base text-sm font-medium tracking-widest uppercase rounded-sm hover:opacity-85 transition-opacity duration-200"
          >
            {t('cta')}
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/components/home/CtaBanner.tsx
git commit -m "feat: charcoal CTA banner with clay button, remove orange glow"
```

---

## Task 13: Footer — Cream Background

**Files:**
- Modify: `src/components/layout/Footer.tsx`

- [ ] **Step 1: Replace the component**

```tsx
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
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/components/layout/__tests__/Footer.test.tsx
```

Expected: all footer tests pass

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Footer.tsx
git commit -m "feat: cream footer, remove orange glow, simplify motion"
```

---

## Task 14: Products Page — Cream Background, Serif Heading

**Files:**
- Modify: `src/app/[locale]/products/page.tsx`

- [ ] **Step 1: Replace the component**

```tsx
import { useTranslations } from 'next-intl'
import ProductCard from '@/components/products/ProductCard'
import { products } from '@/data/products'

function ProductsContent({ locale }: { locale: string }) {
  const t = useTranslations('collection')

  const seasonalCount = products.filter(p => p.seasonal !== null).length

  return (
    <div className="pt-32 pb-24 px-6 bg-cream-base min-h-screen">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-20">
          <h1 className="font-serif text-4xl md:text-5xl font-normal text-charcoal mb-4">
            {t('title')}
          </h1>

          <p className="text-sm text-ink-ghost">
            {products.length} scents
            {seasonalCount > 0 && ` · ${seasonalCount} seasonal`}
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
          {products.map((product) => (
            <ProductCard
              key={product.slug}
              product={product}
              locale={locale}
            />
          ))}
        </div>

      </div>
    </div>
  )
}

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return <ProductsContent locale={locale} />
}
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/app/\[locale\]/products/__tests__/page.test.tsx
```

Expected: products page tests pass

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/products/page.tsx"
git commit -m "feat: cream products page, serif heading, remove dark glow"
```

---

## Task 15: Product Detail Page — Cream, Light Image Container

**Files:**
- Modify: `src/app/[locale]/products/[slug]/page.tsx`

- [ ] **Step 1: Replace the component**

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getProductBySlug, products } from '@/data/products'
import ProductCard from '@/components/products/ProductCard'
import type { Product } from '@/types/product'

export async function generateStaticParams() {
  const locales = ['en', 'bg']
  return locales.flatMap((locale) =>
    products.map((p) => ({ locale, slug: p.slug }))
  )
}

function ProductDetailContent({
  locale,
  product,
}: {
  locale: string
  product: Product
}) {
  const t = useTranslations('product')
  const tNav = useTranslations('nav')

  const related = products
    .filter((p) => p.slug !== product.slug)
    .slice(0, 3)

  return (
    <div className="pt-32 pb-24 px-6 bg-cream-base min-h-screen">
      <div className="max-w-5xl mx-auto">

        {/* Back */}
        <Link
          href={`/${locale}/products`}
          className="text-xs text-ink-ghost hover:text-clay transition-colors duration-200 mb-12 inline-block tracking-widest uppercase"
        >
          ← {tNav('products')}
        </Link>

        {/* MAIN */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 mb-24">

          {/* Image */}
          <div className="relative aspect-square rounded-sm overflow-hidden border border-border bg-cream-surface">
            <Image
              src={product.imagePath}
              alt={product.name}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>

          {/* Content */}
          <div className="flex flex-col justify-center gap-6">

            {/* Title */}
            <h1 className="font-serif text-3xl md:text-4xl font-normal text-charcoal">
              {product.name}
            </h1>

            {/* Descriptor */}
            <p className="text-sm text-ink-ghost tracking-wide">
              {product.descriptor}
            </p>

            {/* Description */}
            <p className="text-base text-ink-secondary leading-relaxed">
              {product.description}
            </p>

            {/* Scent Notes */}
            <div className="pt-4 border-t border-border">
              <p className="text-xs text-ink-ghost tracking-widest uppercase mb-3">
                {t('scentNotes')}
              </p>

              <div className="text-sm text-ink-secondary space-y-1 leading-relaxed">
                <p>{product.scentNotes.top}</p>
                <p>{product.scentNotes.heart}</p>
                <p>{product.scentNotes.base}</p>
              </div>
            </div>

            {/* Ingredients */}
            <div className="flex flex-wrap gap-2 pt-2">
              {product.ingredients.map((ing) => (
                <span
                  key={ing}
                  className="text-xs text-ink-secondary bg-cream-surface border border-border px-3 py-1 rounded-full"
                >
                  {ing}
                </span>
              ))}
            </div>

            {/* CTA */}
            <button
              disabled
              className="mt-6 w-full py-4 text-sm font-medium rounded-sm cursor-not-allowed bg-cream-muted text-ink-ghost tracking-widest uppercase"
            >
              {t('addToCart')}
            </button>
          </div>
        </div>

        {/* RELATED */}
        <div>
          <h2 className="text-xs text-ink-ghost tracking-widest uppercase text-center mb-8">
            {t('relatedProducts')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {related.map((p) => (
              <ProductCard
                key={p.slug}
                product={p}
                locale={locale}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params

  const product = getProductBySlug(slug)

  if (!product) {
    notFound()
  }

  return <ProductDetailContent locale={locale} product={product} />
}
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run "src/app/[locale]/products/[slug]/__tests__/page.test.tsx"
```

Expected: product detail tests pass

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/products/[slug]/page.tsx"
git commit -m "feat: cream product detail page, light image container, remove per-product glow"
```

---

## Task 16: Final Test Run + Visual Verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass with 0 failures

- [ ] **Step 2: Start the dev server and visually verify each page**

```bash
npm run dev
```

Check each route:
- `http://localhost:3000/en` — hero editorial, cream sections, charcoal CTA banner
- `http://localhost:3000/en/products` — cream grid, warm float cards
- `http://localhost:3000/en/products/cherry` — light image container, cream detail layout
- `http://localhost:3000/en/our-story` — no dark backgrounds
- `http://localhost:3000/en/candle-care` — cream page
- `http://localhost:3000/en/contact` — cream page

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete creamy minimal redesign — cream/clay/charcoal editorial theme"
```
