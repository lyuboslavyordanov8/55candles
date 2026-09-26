import { useTranslations } from 'next-intl'
import { FREE_DELIVERY_FROM_ITEMS } from '@/lib/shipping'
import AnnouncementRotator from './AnnouncementRotator'

/**
 * The strip above the navigation.
 *
 * Sand background with dark text, matching the footer — the two sand bands
 * bracket the white page between them.
 *
 * Takes turns between the slogan and the free-delivery offer. The offer's
 * number comes from `FREE_DELIVERY_FROM_ITEMS`, the same constant checkout
 * charges by, so the bar cannot promise a threshold the basket does not honour
 * — and the line disappears if the offer is ever switched off.
 *
 * To change the wording, edit `announcement` in `messages/bg.json` and
 * `messages/en.json`. Keep each line short: the bar is one line tall on a phone,
 * and the header's height is a fixed number the hero relies on.
 */
export default function AnnouncementBar() {
  const t = useTranslations('announcement')

  const lines = [
    t('slogan'),
    ...(FREE_DELIVERY_FROM_ITEMS !== null
      ? [t('freeDelivery', { count: FREE_DELIVERY_FROM_ITEMS })]
      : []),
  ]

  return (
    <div className="bg-brand-sand">
      <AnnouncementRotator lines={lines} />
    </div>
  )
}
