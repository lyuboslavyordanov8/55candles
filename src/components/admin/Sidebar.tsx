'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { BoxIcon, CandleIcon, DocumentIcon, TagIcon } from './icons'

/**
 * The admin's navigation.
 *
 * A Client Component for one reason: the active entry. `usePathname` is the only
 * way to know which page is open without threading the path through every layout
 * and page, and an admin that does not say where you are is the complaint this
 * redesign exists to fix. Nothing else here is interactive.
 *
 * Three entries, which is all there is: orders, invoices, proformas. Products,
 * customers and settings are not in this admin — the catalogue lives in code and
 * there are no accounts — so there are no headings for them. A sidebar with
 * disabled entries for features that do not exist is worse than a short sidebar.
 *
 * Charcoal ground against the cream page: the one high-contrast surface in the
 * interface, so the shell reads as chrome and the content reads as content.
 *
 * Who is signed in is the top bar's job, not this one's: it has to be visible at
 * every width, and this rail's footer disappears below `lg`.
 */

const ENTRIES = [
  { href: '/admin', label: 'Поръчки', icon: BoxIcon, hint: 'какво да се пакетира' },
  { href: '/admin/invoices', label: 'Фактури', icon: DocumentIcon, hint: 'издадени документи' },
  { href: '/admin/proformas', label: 'Проформи', icon: TagIcon, hint: 'оферти за плащане' },
] as const

/**
 * `/admin` matches only itself: it is the orders list, and every other page
 * lives under it, so a `startsWith` test would light up all three entries at
 * once. `/admin/orders/…` is the orders list's own detail view, so that one is
 * matched deliberately.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin' || pathname.startsWith('/admin/orders')

  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function Sidebar() {
  const pathname = usePathname() ?? '/admin'

  return (
    <nav
      aria-label="Админ навигация"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-charcoal bg-charcoal px-3 py-2 text-cream-base lg:h-dvh lg:w-56 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-r lg:border-b-0 lg:px-3 lg:py-4"
    >
      <Link
        href="/admin"
        className="hidden items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-white/5 lg:flex"
      >
        <CandleIcon className="text-brand-sand" />
        <span className="font-serif text-base leading-none text-cream-surface">55° candles</span>
      </Link>

      <p className="mt-6 hidden px-2 pb-1 text-[10px] font-medium tracking-[0.12em] text-cream-muted/45 uppercase lg:block">
        Работа
      </p>

      {ENTRIES.map((entry) => {
        const active = isActive(pathname, entry.href)
        const Icon = entry.icon

        return (
          <Link
            key={entry.href}
            href={entry.href}
            aria-current={active ? 'page' : undefined}
            className={`group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs transition-colors ${
              active
                ? 'bg-cream-base/10 text-cream-surface'
                : 'text-cream-muted/70 hover:bg-white/5 hover:text-cream-surface'
            }`}
          >
            {/* The marker is the clay accent, and it appears nowhere else in the shell. */}
            <span
              aria-hidden="true"
              className={`absolute top-1.5 bottom-1.5 hidden w-[2px] rounded-full bg-brand-sand transition-opacity lg:-left-2 lg:block ${
                active ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <Icon className={active ? 'text-brand-sand' : 'text-cream-muted/55'} />
            <span className="font-medium">{entry.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
