import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../../messages/en.json'
import CandleCarePage from '../page'

// Now a Server Component that takes no props — the animations moved into
// <Reveal>, so the separate client `CandleCareContent` is gone (AUDIT.md S-14).
function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CandleCarePage />
    </NextIntlClientProvider>
  )
}

describe('CandleCarePage', () => {
  it('renders page title', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /candle care/i })).toBeInTheDocument()
  })

  it('renders first burn section', async () => {
    await renderPage()
    expect(screen.getByText(/the first burn/i)).toBeInTheDocument()
  })

  it('renders wick care section', async () => {
    await renderPage()
    expect(screen.getByText(/wick care/i)).toBeInTheDocument()
  })

  it('renders burn time section', async () => {
    await renderPage()
    expect(screen.getByText(/burn time/i)).toBeInTheDocument()
  })

  it('renders storage section', async () => {
    await renderPage()
    expect(screen.getByText(/storage/i)).toBeInTheDocument()
  })
})
