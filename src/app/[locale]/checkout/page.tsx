import { getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { isLocale } from '@/i18n/locales'
import DeliveryForm from '@/components/commerce/DeliveryForm'
import { availablePaymentMethods, type PaymentMethod } from '@/lib/payments'
import { isShippingConfigured, TARIFFS_ARE_PLACEHOLDER } from '@/lib/shipping'
import { unpricedSlugs, PRICING_IS_PROVISIONAL, getPricing } from '@/data/pricing'
import { parseCartParam } from '@/lib/cart-params'
import { formatMoney, multiplyMoney } from '@/lib/money'
import { getProductBySlug } from '@/data/products'
import type { CartLine } from '@/lib/order-total'
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd'

/**
 * Checkout (AUDIT.md Phase 4).
 *
 * The cart comes from the query string (`?items=cherry:2`) because there is no
 * database or session store yet — see `src/lib/cart-params.ts`. That makes the
 * order flow exercisable end to end while remaining honest: the URL carries
 * only slugs and quantities, and every price is re-read server-side.
 *
 * `noindex` for the same reason the legal drafts are: an unfinished checkout
 * must not appear in search results.
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
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  return (
    <CheckoutContent
      locale={locale}
      cart={parseCartParam((await searchParams).items)}
      paymentMethods={availablePaymentMethods()}
      shippingConfigured={isShippingConfigured()}
      unpricedCount={unpricedSlugs().length}
    />
  )
}

/**
 * Split out so the `useTranslations` hook runs in a component whose props are
 * already resolved — the same shape as the legal and product pages. `params`
 * and `searchParams` are promises, and a hook cannot follow an `await`.
 */
function CheckoutContent({
  locale,
  cart,
  paymentMethods,
  shippingConfigured,
  unpricedCount,
}: {
  locale: string
  cart: CartLine[]
  paymentMethods: readonly PaymentMethod[]
  shippingConfigured: boolean
  unpricedCount: number
}) {
  const t = useTranslations('checkout')

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
          {unpricedCount > 0 && ` ${t('unpricedCount', { count: unpricedCount })}`}
        </p>

        {(PRICING_IS_PROVISIONAL || TARIFFS_ARE_PLACEHOLDER) && (
          <p role="note" className="rounded-sm border border-clay/40 bg-cream-surface p-4 text-xs leading-relaxed text-ink-secondary">
            {t('provisionalNumbers')}
          </p>
        )}

        {cart.length === 0 ? (
          <div className="space-y-3 rounded-sm border border-border p-6">
            <p className="text-sm text-charcoal">{t('basketEmpty')}</p>
            <Link
              href={`/${locale}/products`}
              className="inline-block text-[11px] font-medium uppercase tracking-wide text-clay border-b border-clay pb-0.5"
            >
              {t('browseProducts')}
            </Link>
          </div>
        ) : (
          <>
            <section aria-labelledby="basket-heading" className="space-y-3">
              <h2 id="basket-heading" className="font-serif text-lg text-charcoal">
                {t('basket')}
              </h2>

              <ul className="divide-y divide-border rounded-sm border border-border">
                {cart.map((line) => {
                  const product = getProductBySlug(line.slug)
                  const entry = getPricing(line.slug)
                  const lineTotal = entry ? multiplyMoney(entry.price, line.quantity) : null

                  return (
                    <li key={line.slug} className="flex justify-between gap-4 p-4 text-sm">
                      <span className="text-charcoal">
                        {product?.name ?? line.slug}
                        <span className="text-ink-ghost"> × {line.quantity}</span>
                      </span>
                      <span
                        className="text-charcoal"
                        data-line-total={lineTotal?.amountMinor}
                      >
                        {lineTotal ? formatMoney(lineTotal, locale) : t('lineUnpriced')}
                      </span>
                    </li>
                  )
                })}
              </ul>

              {/*
                No total here on purpose. Shipping depends on the delivery
                method the customer has not chosen yet, and showing a
                goods-only "total" that grows at the next step is the pattern
                consumer law exists to prevent. The action returns the full
                breakdown once a method is picked.
              */}
              <p className="text-xs text-ink-ghost">{t('shippingAddedAfterMethod')}</p>
            </section>

            <DeliveryForm
              cart={cart}
              paymentMethods={paymentMethods}
              shippingConfigured={shippingConfigured}
              locale={locale}
            />
          </>
        )}
      </div>
    </main>
  )
}
