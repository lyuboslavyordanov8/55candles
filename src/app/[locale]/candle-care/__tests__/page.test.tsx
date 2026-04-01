import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../../messages/en.json'
import CandleCarePage from '../page'

async function renderPage() {
  const jsx = await CandleCarePage({ params: Promise.resolve({ locale: 'en' }) })
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {jsx}
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
})
