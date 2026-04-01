import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { notFound } from 'next/navigation'
import messages from '../../../../../../messages/en.json'
import ProductDetailPage from '../page'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/products/cherry',
  notFound: vi.fn(),
}))

async function renderPage(slug = 'cherry') {
  const jsx = await ProductDetailPage({ params: Promise.resolve({ locale: 'en', slug }) })
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {jsx}
    </NextIntlClientProvider>
  )
}

describe('ProductDetailPage', () => {
  it('renders the product name', async () => {
    await renderPage('cherry')
    expect(screen.getByRole('heading', { name: /cherry/i })).toBeInTheDocument()
  })

  it('renders scent notes section', async () => {
    await renderPage('cherry')
    expect(screen.getByText(/scent notes/i)).toBeInTheDocument()
  })

  it('renders ingredients section', async () => {
    await renderPage('cherry')
    expect(screen.getByText(/ingredients/i)).toBeInTheDocument()
  })

  it('renders disabled add to cart button', async () => {
    await renderPage('cherry')
    expect(screen.getByRole('button', { name: /add to cart/i })).toBeDisabled()
  })

  it('calls notFound for unknown slug', async () => {
    await renderPage('does-not-exist')
    expect(notFound).toHaveBeenCalled()
  })
})
