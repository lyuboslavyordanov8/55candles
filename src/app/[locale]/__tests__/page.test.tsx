import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import HomePage from '../page'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
}))

async function renderPage() {
  const jsx = await HomePage({ params: Promise.resolve({ locale: 'en' }) })
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {jsx}
    </NextIntlClientProvider>
  )
}

describe('HomePage', () => {
  // The hero italicises the final word, so the headline is split across an <em>.
  // Query by accessible name, which concatenates the heading's descendants.
  it('renders hero headline', async () => {
    await renderPage()
    expect(
      screen.getByRole('heading', { name: "Candles you'll want to eat." })
    ).toBeInTheDocument()
  })

  it('renders scent collection title', async () => {
    await renderPage()
    expect(screen.getAllByText('The Scent Collection').length).toBeGreaterThan(0)
  })

  it('renders candle care section title', async () => {
    await renderPage()
    expect(screen.getByText('How to love your candle')).toBeInTheDocument()
  })

  it('renders story teaser headline', async () => {
    await renderPage()
    expect(screen.getByText("We make candles that look too good to burn.")).toBeInTheDocument()
  })
})
