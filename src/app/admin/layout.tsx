import type { Metadata } from 'next'
import Link from 'next/link'

import { fontVariables } from '@/fonts'
import { currentAdminName, hasAdminSession, isAdminConfigured } from '@/lib/admin-auth'
import { logOut } from './actions'

import '../globals.css'

/**
 * The admin shell (AUDIT.md Phase 7).
 *
 * Its own root layout — `<html>` and `<body>` included — because there is no
 * top-level `app/layout.tsx`: the storefront's root is `[locale]/layout.tsx`, and
 * the admin deliberately does not sit under it. It has no navbar, no cart, no
 * `next-intl` provider and no analytics, so nothing a customer sees can be broken
 * by a change here, and nothing the admin loads reaches a customer's browser.
 *
 * Bulgarian only. It is an internal tool read by the shop, not a page with an
 * audience, so its strings live beside it rather than in `messages/*.json`.
 */

export const metadata: Metadata = {
  title: '55° candles · поръчки',
  // Belt and braces with the proxy: nothing here may ever be indexed, and a
  // crawler that somehow reaches it is told so in the page as well as in headers.
  robots: { index: false, follow: false, nocache: true },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // A read, not a gate. The gate is `requireAdmin()` in each page and action; this
  // only decides whether to draw the logout button.
  const signedIn = isAdminConfigured() && (await hasAdminSession())
  // Only worth reading when there is a session to name — a signed-out visitor
  // gets the login-form default rather than a call to a cookie that is not there.
  const name = signedIn ? await currentAdminName() : null

  return (
    <html lang="bg" className={fontVariables}>
      <body className="min-h-screen bg-stone-50 font-sans text-sm text-stone-900 antialiased print:bg-white">
        {/* Not printed: the фактура page is meant to come out of a printer, and
            the shop's navigation is not part of the document. */}
        <header className="border-b border-stone-200 bg-white print:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/admin" className="font-medium tracking-wide">
              55° candles <span className="text-stone-400">· поръчки</span>
            </Link>

            {signedIn && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-stone-500">{name}</span>
                <form action={logOut}>
                  <button
                    type="submit"
                    className="rounded-sm border border-stone-300 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
                  >
                    Изход
                  </button>
                </form>
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 print:max-w-none print:p-0">{children}</main>
      </body>
    </html>
  )
}
