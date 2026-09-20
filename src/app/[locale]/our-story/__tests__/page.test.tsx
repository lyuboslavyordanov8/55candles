import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../../messages/en.json'
import OurStoryPage from '../page'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

// Now a Server Component that takes no props — the animations moved into
// <Reveal>, so the separate client `OurStoryContent` is gone (AUDIT.md S-14).
function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OurStoryPage />
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
    // By role: the body repeats the question back („is this edible?" is a fair
    // question), so a plain text match finds two nodes.
    expect(screen.getByRole('heading', { name: /is this edible/i })).toBeInTheDocument()
  })

  // The three values are the owner's current wording — what is in the candle,
  // that the fragrance is clean, and that nothing is hidden. They are read from
  // the catalogue rather than retyped, so a copy change moves the assertion with
  // it; what this actually guards is that all three still render.
  it('renders three brand value headings', async () => {
    await renderPage()
    const { value1Title, value2Title, value3Title } = messages.ourStory

    for (const title of [value1Title, value2Title, value3Title]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
  })
})
