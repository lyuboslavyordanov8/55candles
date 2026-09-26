import type { Metadata } from 'next'

import { fontVariables } from '@/fonts'
import { currentAdminName, hasAdminSession, isAdminConfigured } from '@/lib/admin-auth'
import Sidebar from '@/components/admin/Sidebar'
import { ExitIcon } from '@/components/admin/icons'
import { button } from '@/components/admin/ui'
import { logOut } from './actions'

import '../globals.css'

/**
 * The admin shell (AUDIT.md Phase 7).
 *
 * Its own root layout — `<html>` and `<body>` included — because there is no
 * top-level `app/layout.tsx`: the storefront's root is `[locale]/layout.tsx`, and
 * the admin deliberately does not sit under it. It has no navbar, no cart, no
 * `next-intl` provider and no page-view beacon — the traffic page counts
 * customers, never the shop looking at itself — so nothing a customer sees can
 * be broken by a change here, and nothing the admin loads reaches a customer's
 * browser.
 *
 * Bulgarian only. It is an internal tool read by the shop, not a page with an
 * audience, so its strings live beside it rather than in `messages/*.json`.
 *
 * ## The shell
 *
 * A charcoal rail on the left, cream page on the right: the one high-contrast
 * surface in the interface, so navigation reads as chrome and never competes with
 * an order. Below `lg` the rail lies down into a strip across the top, because
 * the alternative — a hamburger holding three links — is a tap in the way of
 * every navigation on the device most likely to be used one-handed beside a
 * printer.
 *
 * The signed-out state has no rail at all. `/admin/login` is the only page that
 * renders inside it, and navigation to pages that would bounce back to the login
 * is not navigation.
 *
 * ## Printing
 *
 * The фактура and проформа pages are meant to come out of a printer, and this
 * shell is not part of the document: the rail, the top bar and the page padding
 * all disappear at print, and the sheet keeps its own millimetre width.
 */

export const metadata: Metadata = {
  title: '55° candles · поръчки',
  // Belt and braces with the proxy: nothing here may ever be indexed, and a
  // crawler that somehow reaches it is told so in the page as well as in headers.
  robots: { index: false, follow: false, nocache: true },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // A read, not a gate. The gate is `requireAdmin()` in each page and action; this
  // only decides whether to draw the shell.
  const signedIn = isAdminConfigured() && (await hasAdminSession())
  // Only worth reading when there is a session to name — a signed-out visitor
  // gets the login-form default rather than a call to a cookie that is not there.
  const name = signedIn ? await currentAdminName() : null

  return (
    <html lang="bg" className={fontVariables}>
      <body className="min-h-dvh bg-cream-base font-sans text-sm text-ink-primary antialiased print:bg-white">
        <div className="lg:flex">
          {signedIn && (
            <div className="print:hidden">
              <Sidebar />
            </div>
          )}

          <div className="min-w-0 flex-1 lg:h-dvh lg:overflow-y-auto print:h-auto print:overflow-visible">
            {signedIn && (
              <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-4 border-b border-border bg-cream-base/85 px-4 backdrop-blur-sm sm:px-6 print:hidden">
                <p className="truncate text-xs text-ink-ghost">
                  Влязъл като <span className="text-ink-secondary">{name}</span>
                </p>

                <form action={logOut}>
                  <button type="submit" className={button('ghost', 'sm')}>
                    <ExitIcon />
                    Изход
                  </button>
                </form>
              </header>
            )}

            <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 print:max-w-none print:space-y-0 print:p-0">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
