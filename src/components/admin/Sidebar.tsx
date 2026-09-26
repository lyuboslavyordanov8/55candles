'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  BoxIcon,
  CalendarIcon,
  CandleIcon,
  ChartIcon,
  DocumentIcon,
  LedgerIcon,
  ReceiptIcon,
  SealIcon,
  TagIcon,
} from './icons'

/**
 * The admin's navigation.
 *
 * A Client Component for one reason: the active entry. `usePathname` is the only
 * way to know which page is open without threading the path through every layout
 * and page, and an admin that does not say where you are is the complaint this
 * redesign exists to fix. Nothing else here is interactive.
 *
 * Two groups, because the shop does two different things here: it packs parcels
 * and it keeps books. Orders first — that is what the admin gets opened for.
 *
 * Products, customers and store settings are not in this admin: the catalogue
 * lives in code and there are no accounts. A sidebar with entries for features
 * that do not exist is worse than a short sidebar.
 *
 * Charcoal ground against the cream page: the one high-contrast surface in the
 * interface, so the shell reads as chrome and the content reads as content.
 *
 * Who is signed in is the top bar's job, not this one's: it has to be visible at
 * every width, and this rail's footer disappears below `lg`.
 */

const GROUPS = [
  {
    heading: 'Работа',
    entries: [
      { href: '/admin', label: 'Поръчки', icon: BoxIcon },
      { href: '/admin/invoices', label: 'Фактури', icon: DocumentIcon },
      { href: '/admin/proformas', label: 'Проформи', icon: TagIcon },
      { href: '/admin/speedy', label: 'Договор Speedy', icon: SealIcon },
      { href: '/admin/traffic', label: 'Трафик', icon: ChartIcon },
    ],
  },
  {
    heading: 'Счетоводство',
    entries: [
      { href: '/admin/accounting', label: 'Обзор', icon: LedgerIcon },
      { href: '/admin/accounting/expenses', label: 'Разходи', icon: ReceiptIcon },
      { href: '/admin/accounting/calendar', label: 'Календар', icon: CalendarIcon },
    ],
  },
] as const

/**
 * Which entry is the page you are on.
 *
 * Two entries need special treatment because every other admin page lives under
 * their path: `/admin` would otherwise light up for all six, and
 * `/admin/accounting` for all three of its own. So both match themselves plus the
 * sub-trees that genuinely belong to them — `/admin/orders/…` is the orders
 * list's detail view, and an accounting month is the overview's.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') {
    return pathname === '/admin' || pathname.startsWith('/admin/orders')
  }

  if (href === '/admin/accounting') {
    return (
      pathname === '/admin/accounting' ||
      pathname.startsWith('/admin/accounting/periods') ||
      pathname.startsWith('/admin/accounting/settings')
    )
  }

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

      {GROUPS.map((group, groupIndex) => (
        <div key={group.heading} className="flex gap-1 lg:mt-4 lg:flex-col lg:gap-0 lg:first:mt-6">
          <p className="hidden px-2 pb-1 text-[10px] font-medium tracking-[0.12em] text-cream-muted/45 uppercase lg:block">
            {group.heading}
          </p>
          {groupIndex > 0 && (
            <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 self-center bg-white/10 lg:hidden" />
          )}
          {group.entries.map((entry) => {
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
        </div>
      ))}
    </nav>
  )
}
