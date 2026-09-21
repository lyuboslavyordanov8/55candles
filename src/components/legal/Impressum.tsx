import { company, formatAddress } from '@/lib/company'

/**
 * Trader identification (AUDIT.md B-16).
 *
 * Bulgarian and EU consumer law require a consumer to be able to identify who
 * they are contracting with before they buy — legal entity name, ЕИК, VAT
 * number where applicable, registered address, and a means of contact that
 * produces a durable record. The site previously showed only a brand name, a
 * phone number and an Instagram handle.
 *
 * `variant="footer"` is the compact form that appears site-wide;
 * `variant="full"` is the block at the foot of each legal document.
 */
export default function Impressum({
  variant = 'footer',
  locale,
}: {
  variant?: 'footer' | 'full'
  locale: string
}) {
  const legalName = locale === 'bg' ? company.legalName : company.legalNameLatin
  const eikLabel = locale === 'bg' ? 'ЕИК' : 'Reg. No.'
  const vatLabel = locale === 'bg' ? 'ДДС №' : 'VAT No.'
  const managerLabel = locale === 'bg' ? 'Управител' : 'Managing director'
  const addressLabel = locale === 'bg' ? 'Адрес на управление' : 'Registered address'

  if (variant === 'footer') {
    return (
      <p className="text-xs text-ink-ghost text-center leading-relaxed">
        {legalName} · {eikLabel} {company.eik}
      </p>
    )
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <dt className="text-ink-ghost">{locale === 'bg' ? 'Търговец' : 'Trader'}</dt>
      <dd className="text-charcoal">
        {legalName}
        {locale !== 'bg' && <span className="text-ink-ghost"> ({company.legalName})</span>}
      </dd>

      <dt className="text-ink-ghost">{eikLabel}</dt>
      <dd className="text-charcoal">{company.eik}</dd>

      {/* Stated in words when there is no number, rather than dropped: a blank
          "ДДС №" reads as an oversight, and someone comparing our prices with a
          VAT-registered shop's is entitled to know no VAT is charged on them. */}
      <dt className="text-ink-ghost">{vatLabel}</dt>
      <dd className="text-charcoal">
        {company.vatNumber ?? (locale === 'bg' ? 'Не е регистриран по ДДС' : 'Not VAT-registered')}
      </dd>

      {/* Not required by ТЗ чл. 13 or ЗЕТ чл. 4, and unpublished by the owner's
          decision — the ЕИК above leads to the register entry either way. */}
      {company.manager && (
        <>
          <dt className="text-ink-ghost">{managerLabel}</dt>
          <dd className="text-charcoal">{company.manager}</dd>
        </>
      )}

      <dt className="text-ink-ghost">{addressLabel}</dt>
      <dd className="text-charcoal">{formatAddress(locale)}</dd>

      <dt className="text-ink-ghost">{locale === 'bg' ? 'Имейл' : 'Email'}</dt>
      <dd className="text-charcoal">{company.contact.email}</dd>

      {/* Only when there is one to show. An empty "Телефон" row is worse than no
          row: it reads as a site that lost its own number. */}
      {company.contact.phone && company.contact.phoneDisplay && (
        <>
          <dt className="text-ink-ghost">{locale === 'bg' ? 'Телефон' : 'Phone'}</dt>
          <dd className="text-charcoal">
            <a href={`tel:${company.contact.phone}`} className="hover:text-clay transition-colors">
              {company.contact.phoneDisplay}
            </a>
          </dd>
        </>
      )}

      <dt className="text-ink-ghost">Instagram</dt>
      <dd className="text-charcoal">
        <a
          href={company.contact.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-clay transition-colors"
        >
          @{company.contact.instagram}
        </a>
      </dd>

      <dt className="text-ink-ghost">
        {locale === 'bg' ? 'Надзорен орган' : 'Supervisory authority'}
      </dt>
      <dd className="text-charcoal">
        {locale === 'bg'
          ? 'Комисия за защита на потребителите'
          : 'Commission for Consumer Protection'}{' '}
        <a
          href="https://kzp.bg"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-ghost hover:text-clay transition-colors"
        >
          kzp.bg
        </a>
      </dd>
    </dl>
  )
}
