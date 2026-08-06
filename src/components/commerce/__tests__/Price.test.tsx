import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import enMessages from '../../../../messages/en.json'
import bgMessages from '../../../../messages/bg.json'
import Price from '../Price'
import { pricing } from '@/data/pricing'
import { eur } from '@/lib/money'

function renderPrice(slug: string, locale = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'bg' ? bgMessages : enMessages}>
      <Price slug={slug} locale={locale} />
    </NextIntlClientProvider>
  )
}

const SNAPSHOT = { ...pricing }

afterEach(() => {
  for (const key of Object.keys(pricing)) delete pricing[key]
  Object.assign(pricing, SNAPSHOT)
})

/** Remove a slug's price for one test, to exercise the unpriced path. */
function unprice(slug: string): void {
  delete pricing[slug]
}

describe('Price', () => {
  it('shows the configured 19,99 EUR price', () => {
    const { container } = renderPrice('cherry')

    expect(container.querySelector('[data-price="1999"]')).toBeInTheDocument()
    expect(screen.getByText(/19\.99/)).toBeInTheDocument()
  })

  it('says "price on request" rather than showing a blank or a zero', () => {
    // A blank looks like a bug; a 0.00 looks like it is free.
    unprice('cherry')
    renderPrice('cherry')

    expect(screen.getByText(/price on request/i)).toBeInTheDocument()
    expect(screen.queryByText(/0[.,]00/)).not.toBeInTheDocument()
  })

  it('translates the unpriced state', () => {
    unprice('cherry')
    renderPrice('cherry', 'bg')

    expect(screen.getByText(/Цена при запитване/)).toBeInTheDocument()
  })

  it('renders a price once one is set', () => {
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }

    const { container } = renderPrice('cherry')

    expect(container.querySelector('[data-price="2450"]')).toBeInTheDocument()
    expect(screen.getByText(/24\.50/)).toBeInTheDocument()
  })

  it('formats per locale', () => {
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }

    renderPrice('cherry', 'bg')

    // Bulgarian uses a comma as the decimal separator.
    expect(screen.getByText(/24,50/)).toBeInTheDocument()
  })

  it('marks a priced but weightless product as not yet available', () => {
    // It would reach checkout and fail there, after wasting the customer's time.
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 0 }

    renderPrice('cherry')

    expect(screen.getByText(/not available yet/i)).toBeInTheDocument()
  })

  it('does not mark a fully configured product', () => {
    pricing.cherry = { price: eur(24.5), packedWeightGrams: 500 }

    renderPrice('cherry')

    expect(screen.queryByText(/not available yet/i)).not.toBeInTheDocument()
  })
})
