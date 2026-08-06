import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { locales } from '@/i18n/locales'
import ContactContent from './ContactContent'

// Thin server wrapper. The UI is a Client Component, and Client Components
// cannot export `metadata`, so the page shell stays on the server.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'contact' })

  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: {
      canonical: `/${locale}/contact`,
      languages: Object.fromEntries(locales.map((l) => [l, `/${l}/contact`])),
    },
  }
}

export default function ContactPage() {
  return <ContactContent />
}
