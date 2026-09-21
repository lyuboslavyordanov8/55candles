'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import BasketEditor from './BasketEditor'
import DeliveryForm from './DeliveryForm'
import { candlesUntilFreeDelivery, FREE_DELIVERY_FROM_ITEMS, type Courier } from '@/lib/shipping'
import type { CartLine } from '@/lib/order-total'

/**
 * The basket editor and the delivery form, sharing whether an order exists.
 *
 * Both used to sit side by side in the Server Component page, each reading its
 * own half of the truth: the form knew it had placed an order, the basket editor
 * above it did not and kept its ± buttons live. Editing a quantity there rewrites
 * `?items=`, which re-renders the page with a *different* basket while the
 * receipt below still described the one just booked — worse, `DeliveryForm`
 * then dropped its priced summary entirely, because it no longer matched the
 * cart in front of it (see `sameBasket` in `DeliveryForm.tsx`).
 *
 * A parcel that has already been booked cannot be un-booked by pressing minus,
 * so once `DeliveryForm` reports the order placed, the basket (and the
 * free-delivery nudge, which is equally pointless once nothing can be added)
 * disappears along with it. `placed` is lifted here, one level above both,
 * because that is the lowest common ancestor that can see it happen and hide
 * the basket in response.
 */

interface Props {
  cart: CartLine[]
  locale: string
  intentToken: string
  shippingConfigured: boolean
  promoCodesEnabled: boolean
  officeLookup: readonly Courier[]
  officeDataIsDemo: boolean
}

export default function CheckoutFlow({
  cart,
  locale,
  intentToken,
  shippingConfigured,
  promoCodesEnabled,
  officeLookup,
  officeDataIsDemo,
}: Props) {
  const t = useTranslations('checkout')
  const [placed, setPlaced] = useState(false)

  /** Candles, not lines: three of one scent earn the free delivery (Q-24). */
  const itemCount = cart.reduce((count, line) => count + line.quantity, 0)
  const candlesToFree = candlesUntilFreeDelivery(itemCount)

  return (
    <>
      {!placed && (
        <section aria-labelledby="basket-heading" className="space-y-3">
          <h2 id="basket-heading" className="font-serif text-lg text-charcoal">
            {t('basket')}
          </h2>

          <BasketEditor lines={cart} locale={locale} />

          {FREE_DELIVERY_FROM_ITEMS !== null && (
            <p className="text-xs text-clay">
              {candlesToFree === null
                ? t('freeDeliveryEarned')
                : t('freeDeliveryNudge', {
                    missing: candlesToFree,
                    from: FREE_DELIVERY_FROM_ITEMS,
                  })}
            </p>
          )}
        </section>
      )}

      <DeliveryForm
        cart={cart}
        intentToken={intentToken}
        shippingConfigured={shippingConfigured}
        promoCodesEnabled={promoCodesEnabled}
        officeLookup={officeLookup}
        officeDataIsDemo={officeDataIsDemo}
        locale={locale}
        onOrderPlaced={() => setPlaced(true)}
      />
    </>
  )
}
