import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import enMessages from '../../../../../../messages/en.json'
import bgMessages from '../../../../../../messages/bg.json'
import LegalPage from '../page'
import { LEGAL_DOCS } from '@/lib/legal'

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

async function renderDoc(slug: string, locale = 'en') {
  const messages = locale === 'bg' ? bgMessages : enMessages
  const ui = await LegalPage({ params: Promise.resolve({ locale, slug }) })

  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  )
}

describe('LegalPage', () => {
  it.each(LEGAL_DOCS.map((d) => d.slug))('renders %s with a heading and body', async (slug) => {
    await renderDoc(slug)

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    // Every document has at least one section heading.
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0)
  })

  it('404s on an unknown document', async () => {
    await expect(renderDoc('not-a-document')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('shows no draft warning now that the documents are published', async () => {
    // The banner came down with `LEGAL_IS_DRAFT` on 2026-09-21. Asserted from the
    // rendered page rather than from the flag, because the flag is only useful if
    // it actually reaches the markup — and if the texts are ever reopened this
    // test is the one that has to be flipped back with it.
    await renderDoc('terms')

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(screen.queryByText(/not yet been reviewed|not yet reviewed/i)).not.toBeInTheDocument()
  })

  it('identifies the trader on every document (B-16)', async () => {
    await renderDoc('privacy')

    expect(screen.getByText('208907603')).toBeInTheDocument()
    // The name appears both in the document body and in the impressum block.
    expect(screen.getAllByText(/ВиреонЛабс/).length).toBeGreaterThan(0)
    expect(screen.getByText(/kzp\.bg/)).toBeInTheDocument()
  })

  it('renders the Bulgarian document in Bulgarian', async () => {
    await renderDoc('terms', 'bg')

    expect(screen.getByRole('heading', { level: 1, name: 'Общи условия' })).toBeInTheDocument()
  })

  it('links to the sibling documents but not to itself', async () => {
    await renderDoc('terms')

    const nav = screen.getByRole('navigation', { name: /legal documents/i })
    const hrefs = Array.from(nav.querySelectorAll('a')).map((a) => a.getAttribute('href'))

    expect(hrefs).toHaveLength(LEGAL_DOCS.length - 1)
    expect(hrefs).not.toContain('/en/legal/terms')
    expect(hrefs).toContain('/en/legal/privacy')
  })

  it('shows when the text was last changed', async () => {
    await renderDoc('terms')

    // A date the customer can rely on, not a build timestamp.
    const time = document.querySelector('time')
    expect(time).toHaveAttribute('dateTime', '2026-08-06')
  })
})
