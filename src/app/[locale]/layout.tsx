import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'

import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import { CartProvider } from '@/components/cart/CartProvider'
import CartDrawer from '@/components/cart/CartDrawer'
import MotionProvider from '@/components/providers/MotionProvider'
import { OrganizationJsonLd } from '@/components/seo/JsonLd'
import { homeBanner, bannerText } from '@/content/home-banner'
import { fontVariables } from '@/fonts'
import { defaultLocale, isLocale, locales, localeAlternates } from '@/i18n/locales'
import { pickClientMessages } from '@/i18n/client-namespaces'
import { siteUrl, isSiteUrlConfigured } from '@/lib/site'

import '../globals.css'

const descriptions: Record<string, string> = {
  en: 'Eco-friendly, non-toxic candles with hand-sculpted wax fruit. No nasties, ever.',
  bg: 'Екологични, нетоксични свещи с ръчно изработени плодове от восък. Без вредни съставки, никога.',
}

// Kept out of the message catalogue: this link renders before
// NextIntlClientProvider is mounted in the tree.
const skipToContent: Record<string, string> = {
  en: 'Skip to content',
  bg: 'Към съдържанието',
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  // Falls back to the default locale rather than to a hardcoded language, so
  // the fallback follows `defaultLocale` instead of quietly disagreeing with it.
  const description = descriptions[locale] ?? descriptions[defaultLocale]

  return {
    metadataBase: new URL(siteUrl),
    // `default` applies to pages that set no title; `template` wraps those
    // that do, so a product page becomes "Cherry — 55° candles".
    title: {
      default: '55° candles',
      template: '%s — 55° candles',
    },
    description,
    alternates: {
      canonical: `/${locale}`,
      languages: localeAlternates(''),
    },
    openGraph: {
      type: 'website',
      siteName: '55° candles',
      locale: locale === 'bg' ? 'bg_BG' : 'en_GB',
      url: `/${locale}`,
      title: '55° candles',
      description,
      // The homepage banner, at its real pixel size. The previous entry claimed
      // 1200×630 for a 1379×271 file; a scraper that trusts the declared size
      // reserves the wrong box and some crop the difference off.
      images: [
        {
          url: homeBanner.image,
          width: homeBanner.imageWidth,
          height: homeBanner.imageHeight,
          alt: bannerText(homeBanner.alt, locale),
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: '55° candles',
      description,
      images: [homeBanner.image],
    },
    // Keep previews and local builds out of the index until a real domain is
    // configured (AUDIT.md Q-06).
    robots: isSiteUrlConfigured
      ? { index: true, follow: true }
      : { index: false, follow: false },
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

  // [locale] is a catch-all single segment, so it also matches junk like
  // /robots.txt or /foo.bar — anything the proxy skips because it contains a
  // dot. Without this guard those render the homepage with a 200, which is a
  // soft 404 and serves HTML to crawlers asking for text files.
  if (!isLocale(locale)) {
    notFound()
  }

  // Only the namespaces Client Components read cross into the RSC payload.
  // Server Components resolve their own messages via next-intl's server
  // context and never touch this (AUDIT.md S-14).
  const messages = pickClientMessages(await getMessages())

  return (
    <html lang={locale} className={fontVariables}>
      <body className="bg-paper-white text-ink-primary font-sans antialiased">
        {/*
          Reveal server-renders its children at `opacity: 0` and framer-motion
          animates them in on the client. That means every animated section —
          27 elements on the homepage — is invisible until JS executes, so a
          browser with JS disabled sees an entirely blank page.

          This restores them. `!important` is required to beat the inline
          style framer-motion emits, and `transform: none` undoes the paired
          translate/scale offsets.
        */}
        <noscript>
          <style>{`[style*="opacity:0"]{opacity:1!important;transform:none!important}`}</style>
        </noscript>

        {/* Identifies the trader to search engines (AUDIT.md S-12). */}
        <OrganizationJsonLd locale={locale} />

        <NextIntlClientProvider messages={messages}>
          <MotionProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded-sm focus:bg-charcoal focus:px-4 focus:py-2 focus:text-cream-base focus:text-xs focus:tracking-widest focus:uppercase"
            >
              {skipToContent[locale] ?? skipToContent[defaultLocale]}
            </a>

            {/*
              The cart is browser state (localStorage), so the provider has to
              sit above the header — which shows the count — and the pages that
              add to it. The drawer is mounted once here rather than per page,
              so opening it never depends on which route you are on.
            */}
            <CartProvider>
              <Navbar />
              <main id="main">{children}</main>
              <Footer />
              <CartDrawer />
            </CartProvider>
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}