import { requireAdmin } from '@/lib/admin-auth'
import { ACCOUNTANT_REQUIREMENTS, vatState, vatThresholdConfig } from '@/lib/accounting/config'
import { accountantSettingsFor, companyProfile } from '@/lib/accounting/settings'
import { econtCodPayout } from '@/lib/couriers'
import { formatMoney, money } from '@/lib/money'
import { saveAccountant } from '../actions'
import {
  Badge,
  button,
  DetailRow,
  fieldLabel,
  input,
  Notice,
  PageHeader,
  Section,
  textarea,
} from '@/components/admin/ui'

/**
 * Accounting settings: the accountant, and what they ask for.
 *
 * The company's own details are **shown and not editable**, and that is the
 * point of the block rather than a limitation of it. They live in
 * `src/lib/company.ts` and in the bank environment variables — they are on the
 * impressum, on every invoice and in the Търговски регистър — and a second
 * editable copy here is how an invoice ends up carrying an address the company
 * no longer has.
 *
 * Nothing from the environment reaches the browser. `companyProfile()` runs on
 * the server and returns the handful of fields this page prints.
 */

export const metadata = {
  title: 'Настройки на счетоводството',
  robots: { index: false, follow: false, nocache: true },
}

export default async function AccountingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  await requireAdmin()

  const { saved } = await searchParams
  const [accountant, profile] = await Promise.all([accountantSettingsFor(), companyProfile()])
  const vat = vatState()
  const threshold = vatThresholdConfig()
  // Only what the admin label button would send. A waybill made by hand in
  // е-Еконт picks its own payout there, so this says nothing about those.
  const codPayout = econtCodPayout()

  return (
    <>
      <PageHeader
        title="Настройки"
        back={{ href: '/admin/accounting', label: 'счетоводство' }}
        description="Кой е счетоводителят и какво иска всеки месец. Данните на дружеството се виждат, но не се променят оттук."
      />

      {saved && <Notice tone="success">Настройките са записани.</Notice>}

      <Section
        title="Данни на дружеството"
        description="Поддържат се от конфигурацията на системата."
        actions={
          <Badge tone={vat.registered ? 'info' : 'neutral'}>
            {vat.registered ? `по ЗДДС: ${vat.number ?? '—'}` : 'нерегистрирано по ЗДДС'}
          </Badge>
        }
      >
        <dl>
          <DetailRow label="Фирма">{profile.legalName}</DetailRow>
          <DetailRow label="ЕИК">
            <span className="tabular-nums">{profile.eik}</span>
          </DetailRow>
          <DetailRow label="Адрес">{profile.address}</DetailRow>
          <DetailRow label="Имейл">{profile.email}</DetailRow>
          <DetailRow label="МОЛ">{profile.manager ?? '— (не се публикува)'}</DetailRow>
          <DetailRow label="Банка">
            {profile.bank ? (
              <>
                <span className="tabular-nums">{profile.bank.iban}</span>
                <span className="block text-ink-ghost">
                  {profile.bank.bankName} · BIC {profile.bank.bic} · титуляр{' '}
                  {profile.bank.holder}
                </span>
              </>
            ) : (
              <span className="text-ink-ghost">
                не е настроена (COMPANY_IBAN, COMPANY_BIC, COMPANY_BANK)
              </span>
            )}
          </DetailRow>
          <DetailRow label="Наложен платеж (Еконт)">
            {codPayout === null ? (
              <span className="text-ink-ghost">
                не е настроен — парите от товарителници от сайта остават на гише
                (ECONT_COD_PAY_TEMPLATE)
              </span>
            ) : 'template' in codPayout ? (
              <>
                споразумение <span className="tabular-nums">{codPayout.template}</span>
                <span className="block text-ink-ghost">
                  за товарителници, създадени от сайта
                </span>
              </>
            ) : (
              <>
                по сметка <span className="tabular-nums">{codPayout.iban}</span>
                <span className="block text-ink-ghost">
                  BIC {codPayout.bic} · за товарителници, създадени от сайта
                </span>
              </>
            )}
          </DetailRow>
        </dl>

        <p className="mt-3 border-t border-border/60 pt-3 text-xs text-ink-ghost">
          Променят се в {profile.source} — не оттук. Така фактура, издадена преди две години,
          продължава да носи данните от тогава.
        </p>
      </Section>

      <Section
        title="Праг за регистрация по ДДС"
        description="Следенето е изключено, докато няма зададен праг."
      >
        <dl>
          <DetailRow label="Зададен праг">
            {threshold.thresholdMinor === null ? (
              <span className="text-ink-ghost">не е зададен</span>
            ) : (
              <span className="tabular-nums">
                {formatMoney(money(threshold.thresholdMinor), 'bg')}
              </span>
            )}
          </DetailRow>
          <DetailRow label="Период">
            <span className="tabular-nums">{threshold.windowMonths}</span> месеца назад
          </DetailRow>
          <DetailRow label="Основание">{threshold.legalSource}</DetailRow>
        </dl>

        <p className="mt-3 border-t border-border/60 pt-3 text-xs text-ink-ghost">
          Стойността се задава като <code className="font-medium">ACCOUNTING_VAT_THRESHOLD_EUR</code>{' '}
          (и по желание <code className="font-medium">ACCOUNTING_VAT_WINDOW_MONTHS</code>). Не слагам
          число по подразбиране: прагът се е променял, зависи от годината и от начина на измерване,
          а грешна стойност или вдига фалшива тревога, или мълчи, когато не трябва. Вземи текущата
          от счетоводителя.
        </p>
      </Section>

      <form action={saveAccountant} className="space-y-5">
        <Section title="Счетоводител">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={fieldLabel}>Име</span>
              <input name="name" defaultValue={accountant.name} maxLength={200} className={input} />
            </label>
            <label className="block">
              <span className={fieldLabel}>Имейл</span>
              <input
                type="email"
                name="email"
                defaultValue={accountant.email}
                maxLength={200}
                className={input}
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className={fieldLabel}>Бележка</span>
            <textarea
              name="note"
              rows={2}
              maxLength={1000}
              defaultValue={accountant.note}
              className={textarea}
            />
          </label>
        </Section>

        <Section
          title="Какво иска счетоводителят всеки месец"
          description="Отметнатото определя какво съдържа пакетът и какво месецът проверява."
        >
          <ul className="space-y-2">
            {ACCOUNTANT_REQUIREMENTS.map((requirement) => (
              <li key={requirement.key}>
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    name="requirements"
                    value={requirement.key}
                    defaultChecked={accountant.requirements.includes(requirement.key)}
                    disabled={!requirement.available}
                    className="mt-0.5 size-4 accent-charcoal disabled:opacity-40"
                  />
                  <span>
                    <span
                      className={
                        requirement.available ? 'text-ink-primary' : 'text-ink-ghost line-through'
                      }
                    >
                      {requirement.label}
                    </span>
                    {requirement.unavailableReason && (
                      <span className="mt-0.5 block text-ink-ghost">
                        {requirement.unavailableReason}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <p className="mt-3 border-t border-border/60 pt-3 text-xs text-ink-ghost">
            Зачертаните ги няма не защото не са важни, а защото системата още не може да ги
            произведе — вижда се точно защо, за да не се търси бутон, който го няма.
          </p>
        </Section>

        <button type="submit" className={button('primary', 'lg')}>
          Запиши настройките
        </button>
      </form>
    </>
  )
}
