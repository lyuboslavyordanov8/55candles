import { getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { isLocale } from '@/i18n/locales'
import CheckoutFlow from '@/components/commerce/CheckoutFlow'
import { isShippingConfigured, type Courier } from '@/lib/shipping'
import { deliveryRatesArePlaceholders } from '@/lib/shipping-rates'
import { promoCodesConfigured } from '@/lib/promo'
import { isMailerConfigured } from '@/lib/mailer'
import { couriersWithOfficeLookup, econtEnvironment } from '@/lib/couriers'
import { unpricedSlugs, PRICING_IS_PROVISIONAL } from '@/data/pricing'
import { parseCartParam } from '@/lib/cart-params'
import type { CartLine } from '@/lib/order-total'
import { newIntentToken } from '@/lib/orders'
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd'

/**
 * Checkout (AUDIT.md Phase 4).
 *
 * The cart comes from the query string (`?items=cherry:2`) because there is no
 * session store yet — see `src/lib/cart-params.ts`. That makes the order flow
 * exercisable end to end while remaining honest: the URL carries only slugs and
 * quantities, and every price is re-read server-side.
 *
 * Orders themselves *are* stored (Q-34) — the action writes one and hands back its
 * number — and a confirmation is emailed when a mail provider is configured
 * (B-17), so the page no longer tells the customer to order by hand. It stays
 * `noindex` because the delivery rates are placeholders for one courier (Q-22)
 * and the legal pages are unreviewed drafts; an unfinished checkout must not
 * appear in search results.
 *
 * Server Component. It reads what is configured on the server — tariffs, prices,
 * courier credentials — and hands the form only what it needs, so no credential
 * check reaches the client bundle.
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
      /*
        Minted per render, which is per request — this page reads `searchParams`,
        so it is never cached and two customers can never share a token. It is
        what makes a double-click one order (AUDIT.md B-09): the form replays this
        value and `orders.intent_token` is unique. Changing the basket re-renders
        the page and mints a new one, which is correct — that is a different
        intent.
      */
      intentToken={newIntentToken()}
      shippingConfigured={isShippingConfigured()}
      /*
        Server-side, because it depends on courier credentials. False once the
        courier prices each parcel itself — at which point the notice would be
        telling the customer their delivery cost is illustrative when it is the
        real one.
      */
      ratesArePlaceholders={deliveryRatesArePlaceholders()}
      /*
        A boolean, never the code table: `src/lib/promo.ts` is `server-only`
        precisely so the browser bundle cannot carry a list of live discounts.
      */
      promoCodesEnabled={promoCodesConfigured()}
      unpricedCount={unpricedSlugs().length}
      /*
        A boolean, not the key: whether a confirmation can be sent is the only
        part of the mail configuration the page is entitled to know. The notice it
        controls is a promise to the customer, so it is read from the same
        function the action reads before sending (`src/lib/mailer.ts`) rather than
        from a hand-maintained flag that could outlive the truth.
      */
      canEmailConfirmation={isMailerConfigured()}
      officeLookup={couriersWithOfficeLookup()}
      officeDataIsDemo={econtEnvironment() === 'demo'}
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
  intentToken,
  shippingConfigured,
  ratesArePlaceholders,
  promoCodesEnabled,
  unpricedCount,
  canEmailConfirmation,
  officeLookup,
  officeDataIsDemo,
}: {
  locale: string
  cart: CartLine[]
  intentToken: string
  shippingConfigured: boolean
  ratesArePlaceholders: boolean
  promoCodesEnabled: boolean
  unpricedCount: number
  canEmailConfirmation: boolean
  officeLookup: readonly Courier[]
  officeDataIsDemo: boolean
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

          This used to say the checkout was not live at all and ask the customer
          to order by hand. It no longer does: orders are stored and the
          confirmation email is sent from the action. What remains is the one
          case where the customer would otherwise be left waiting for an email
          that never arrives — a shop with no mail provider configured.
        */}
        {!canEmailConfirmation && (
          <p role="note" className="rounded-sm border border-border bg-cream-surface p-4 text-xs leading-relaxed text-ink-secondary">
            {t('noConfirmationEmail')}
          </p>
        )}

        {unpricedCount > 0 && (
          <p role="note" className="rounded-sm border border-border bg-cream-surface p-4 text-xs leading-relaxed text-ink-secondary">
            {t('unpricedCount', { count: unpricedCount })}
          </p>
        )}

        {/*
          One notice per flag, rather than one sentence covering both. They were
          combined, and the combined text went on calling the parcel weight a
          stand-in after the owner supplied the real one — a claim the customer
          has no way to check and no reason to disbelieve. Each notice now says
          only what its own flag is still true about.
        */}
        {PRICING_IS_PROVISIONAL && (
          <p role="note" className="rounded-sm border border-clay/40 bg-cream-surface p-4 text-xs leading-relaxed text-ink-secondary">
            {t('provisionalPricing')}
          </p>
        )}

        {ratesArePlaceholders && (
          <p role="note" className="rounded-sm border border-clay/40 bg-cream-surface p-4 text-xs leading-relaxed text-ink-secondary">
            {t('provisionalRates')}
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
          /*
            Basket editor and delivery form together, sharing whether the order
            has been placed — see `CheckoutFlow` for why that has to be lifted
            above both rather than left inside `DeliveryForm` alone.
          */
          <CheckoutFlow
            cart={cart}
            intentToken={intentToken}
            shippingConfigured={shippingConfigured}
            promoCodesEnabled={promoCodesEnabled}
            officeLookup={officeLookup}
            officeDataIsDemo={officeDataIsDemo}
            locale={locale}
          />
        )}
      </div>
    </main>
  )
}
