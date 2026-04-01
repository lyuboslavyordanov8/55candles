import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../../messages/en.json'
import OurStoryPage from '../page'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

async function renderPage() {
  const jsx = await OurStoryPage({ params: Promise.resolve({ locale: 'en' }) })
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {jsx}
    </NextIntlClientProvider>
  )
}

describe('OurStoryPage', () => {
  it('renders page title', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /our story/i })).toBeInTheDocument()
  })

  it('renders the edible question section', async () => {
    await renderPage()
    expect(screen.getByText(/is it edible/i)).toBeInTheDocument()
  })

  it('renders three brand value headings', async () => {
    await renderPage()
    expect(screen.getByText(/eco-friendly/i)).toBeInTheDocument()
    expect(screen.getByText(/non-toxic/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /honest/i })).toBeInTheDocument()
  })
})
