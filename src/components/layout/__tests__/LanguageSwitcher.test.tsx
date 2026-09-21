import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import LanguageSwitcher from '../LanguageSwitcher'

/**
 * Bug report: switching language on the checkout page emptied the basket.
 *
 * The checkout page is the one place the cart lives in the URL
 * (`?items=cherry:2`, see `src/lib/cart-params.ts`) rather than in
 * `localStorage` like everywhere else. `usePathname()` never includes the
 * query string — that is how Next.js defines it — so building the
 * target locale's link from the pathname alone silently drops `?items=`,
 * and the customer's basket appears to vanish on the very next page.
 */

let mockPathname = '/bg/checkout'
let mockSearch = ''

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

function renderSwitcher(locale: 'en' | 'bg') {
  return render(
    <NextIntlClientProvider locale={locale} messages={{}}>
      <LanguageSwitcher />
    </NextIntlClientProvider>
  )
}

describe('LanguageSwitcher', () => {
  it('swaps the locale segment when there is no query string', () => {
    mockPathname = '/bg/products'
    mockSearch = ''

    renderSwitcher('bg')

    expect(screen.getByRole('link', { name: 'Switch to English' })).toHaveAttribute(
      'href',
      '/en/products'
    )
  })

  it('carries the checkout basket query string across a language switch', () => {
    mockPathname = '/bg/checkout'
    mockSearch = 'items=cherry%3A2%2Cvanilla%3A1'

    renderSwitcher('bg')

    // The compact toggle (phones) — the aria-label names where it goes, not
    // the current locale, so it uniquely identifies this link.
    expect(screen.getByRole('link', { name: 'Switch to English' })).toHaveAttribute(
      'href',
      '/en/checkout?items=cherry%3A2%2Cvanilla%3A1'
    )
  })

  it('carries an arbitrary query string on the full desktop pill too', () => {
    mockPathname = '/en/checkout'
    mockSearch = 'items=cherry%3A2'

    renderSwitcher('en')

    // The desktop pill renders both languages; the Bulgarian link is the one
    // that actually navigates anywhere from this locale.
    expect(screen.getByRole('link', { name: 'BG' })).toHaveAttribute(
      'href',
      '/bg/checkout?items=cherry%3A2'
    )
  })
})
