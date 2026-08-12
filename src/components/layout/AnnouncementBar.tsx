import { useTranslations } from 'next-intl'

/**
 * The strip above the navigation.
 *
 * Sand background with dark text, matching the footer — the two sand bands
 * bracket the white page between them.
 *
 * Server Component: one line of static text.
 *
 * To change the wording, edit `announcement.text` in `messages/bg.json` and
 * `messages/en.json`.
 */
export default function AnnouncementBar() {
  const t = useTranslations('announcement')

  return (
    <div className="bg-brand-sand">
      <p className="px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-primary">
        {t('text')}
      </p>
    </div>
  )
}
