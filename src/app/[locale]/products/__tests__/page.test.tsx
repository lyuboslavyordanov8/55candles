import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../../messages/en.json'
import ProductsPage from '../page'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/products',
}))

async function renderPage() {
  const jsx = await ProductsPage({ params: Promise.resolve({ locale: 'en' }) })
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {jsx}
    </NextIntlClientProvider>
  )
}

describe('ProductsPage', () => {
  it('renders section title', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /the scent collection/i })).toBeInTheDocument()
  })

  it('renders a learn more link for every product', async () => {
    await renderPage()
    const links = screen.getAllByRole('link', { name: /learn more/i })
    expect(links).toHaveLength(6)
  })
})
