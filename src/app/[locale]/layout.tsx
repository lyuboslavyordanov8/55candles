import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Montserrat, Playfair_Display } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'

import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import MotionProvider from '@/components/providers/MotionProvider'
import { OrganizationJsonLd } from '@/components/seo/JsonLd'
import { isLocale, locales } from '@/i18n/locales'
import { pickClientMessages } from '@/i18n/client-namespaces'
import { siteUrl, isSiteUrlConfigured } from '@/lib/site'

import '../globals.css'

const montserrat = Montserrat({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-montserrat',
  display: 'swap',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
})

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
  const description = descriptions[locale] ?? descriptions.en

  return {
    metadataBase: new URL(siteUrl),
    // `default` applies to pages that set no title; `template` wraps those
    // that do, so a product page becomes "Cherry — 55candles".
    title: {
      default: '55candles',
      template: '%s — 55candles',
    },
    description,
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(locales.map((l) => [l, `/${l}`])),
    },
    openGraph: {
      type: 'website',
      siteName: '55candles',
      locale: locale === 'bg' ? 'bg_BG' : 'en_GB',
      url: `/${locale}`,
      title: '55candles',
      description,
      images: [{ url: '/images/hero.jpg', width: 1200, height: 630, alt: '55candles' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: '55candles',
      description,
      images: ['/images/hero.jpg'],
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
    <html lang={locale} className={`${montserrat.variable} ${playfair.variable}`}>
      <body className="bg-cream-base text-charcoal font-sans antialiased">
        {/* Identifies the trader to search engines (AUDIT.md S-12). */}
        <OrganizationJsonLd locale={locale} />

        <NextIntlClientProvider messages={messages}>
          <MotionProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded-sm focus:bg-charcoal focus:px-4 focus:py-2 focus:text-cream-base focus:text-xs focus:tracking-widest focus:uppercase"
            >
              {skipToContent[locale] ?? skipToContent.en}
            </a>

            <Navbar />
            <main id="main">{children}</main>
            <Footer />
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}