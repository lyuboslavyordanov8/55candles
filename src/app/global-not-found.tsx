// Handles URLs that match no route at all. Because the only root layout lives
// under the dynamic [locale] segment, there is no layout to compose a 404 from
// — which is exactly the case global-not-found.tsx exists for. It bypasses
// normal rendering, so it must ship its own <html>, styles and fonts.
//
// Requires `experimental.globalNotFound: true` in next.config.ts.
//
// There is no locale to read here, so the copy is deliberately bilingual.
import type { Metadata } from 'next'

import Logo from '@/components/layout/Logo'
import { montserrat } from '@/fonts'

import './globals.css'

export const metadata: Metadata = {
  title: '404 — 55candles',
  description: 'The page you are looking for does not exist.',
}

export default function GlobalNotFound() {
  return (
    <html lang="en" className={montserrat.variable}>
      <body className="bg-paper-white text-ink-primary font-sans antialiased">
        <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <Logo className="mb-16 h-5 w-auto" />

          <p className="text-xs tracking-[0.35em] uppercase text-ink-ghost mb-6">404</p>

          <h1 className="text-3xl md:text-4xl font-normal text-charcoal mb-3">
            Страницата не е намерена
          </h1>
          <p className="text-base text-ink-secondary mb-10">Page not found</p>

          <div className="flex flex-wrap items-center justify-center gap-6">
            <a
              href="/bg"
              className="inline-flex items-center justify-center px-8 py-3 bg-charcoal text-cream-base text-xs font-medium tracking-widest uppercase rounded-sm hover:bg-clay transition-colors duration-300"
            >
              Към началото
            </a>
            <a
              href="/en"
              className="text-xs tracking-widest uppercase text-clay border-b border-clay pb-0.5 hover:opacity-70 transition-opacity duration-200"
            >
              Home →
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
