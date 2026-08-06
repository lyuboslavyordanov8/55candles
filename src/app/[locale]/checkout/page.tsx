import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLocale } from '@/i18n/locales'
import DeliveryForm from '@/components/commerce/DeliveryForm'
import { availablePaymentMethods } from '@/lib/payments'
import { isShippingConfigured } from '@/lib/shipping'
import { unpricedSlugs } from '@/data/pricing'
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd'

/**
 * Checkout (AUDIT.md Phase 4).
 *
 * There is no cart yet — no database, no session store (Q-34) — so this page
 * cannot show a real basket. It exists so the delivery and payment form is
 * reachable and reviewable, and it is `noindex` for the same reason the legal
 * drafts are: an unfinished checkout must not appear in search results.
 *
 * Server Component. It reads what is configured on the server — payment
 * methods, tariffs, prices — and hands the form only what it needs, so no
 * credential check reaches the client bundle.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'checkout' })

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    // Not indexable while the cart and order storage do not exist.
    robots: { index: false, follow: true },
  }
}

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const t = await getTranslations({ locale, namespace: 'checkout' })

  const paymentMethods = availablePaymentMethods()
  const shippingConfigured = isShippingConfigured()
  const catalogueUnpriced = unpricedSlugs()

  return (
    <main className="bg-cream-base min-h-screen px-6 py-20">
      <BreadcrumbJsonLd
        items={[
          { href: `/${locale}`, name: t('breadcrumbHome') },
          { href: `/${locale}/checkout`, name: t('title') },
        ]}
      />

      <div className="mx-auto max-w-2xl space-y-10">
        <header className="space-y-3">
          <h1 className="font-serif text-3xl font-normal text-charcoal">{t('title')}</h1>
          <p className="text-sm leading-relaxed text-ink-secondary">{t('intro')}</p>
        </header>

        {/*
          The honest state of things, stated on the page rather than discovered
          at the payment step. Same principle as the legal draft banner.
        */}
        <p role="note" className="rounded-sm border border-border bg-cream-surface p-4 text-xs leading-relaxed text-ink-secondary">
          {t('notLiveYet')}
          {catalogueUnpriced.length > 0 && ` ${t('unpricedCount', { count: catalogueUnpriced.length })}`}
        </p>

        <DeliveryForm
          cart={[]}
          paymentMethods={paymentMethods}
          shippingConfigured={shippingConfigured}
        />
      </div>
    </main>
  )
}
