import Link from 'next/link'

import { requireAdmin } from '@/lib/admin-auth'
import { formatMoney, money } from '@/lib/money'
import {
  upcomingCompliance,
  vatMonitor,
  vatState,
  vatThresholdConfig,
} from '@/lib/accounting/config'
import { formatPeriod, periodOf } from '@/lib/accounting/period-key'
import {
  getAccountingPeriod,
  listAccountingPeriods,
  turnoverOverMonths,
  type AccountingPeriod,
  type CloseCheck,
} from '@/lib/accounting/periods'
import { labelOf, PERIOD_STATUSES } from '@/lib/accounting/vocabulary'
import { isOrderStorageReady } from '@/lib/orders'
import {
  Badge,
  button,
  DetailRow,
  Notice,
  PageHeader,
  panel,
  Section,
} from '@/components/admin/ui'

/**
 * The accounting overview: what this month owes the accountant, and what is due.
 *
 * Built to be understood in the three seconds before the owner decides whether
 * today is the day they deal with it. So the order is: the current month's
 * health, then the figures behind it, then what is coming, then the months
 * before it. No charts — a graph of two months of a candle shop's revenue is
 * decoration, and this page is a to-do list.
 *
 * Every figure comes from `orders`, `invoices` and `expenses` through
 * `periods.ts`; nothing is stored twice and nothing is invented. Where the shop
 * cannot produce a number — a refunded *amount*, a courier statement — the page
 * says so rather than showing a zero that reads as a fact.
 */

export const metadata = {
  title: 'Счетоводство',
  robots: { index: false, follow: false, nocache: true },
}

const CHECK_MARK: Record<CloseCheck['state'], string> = {
  done: '✓',
  attention: '⚠',
  empty: '·',
}

export default async function AccountingOverviewPage() {
  await requireAdmin()

  if (!isOrderStorageReady()) {
    return (
      <Notice>
        Няма настроена база данни (DATABASE_URL) — счетоводството няма откъде да чете.
      </Notice>
    )
  }

  const current = periodOf(new Date())
  const threshold = vatThresholdConfig()

  const [month, previous, turnover] = await Promise.all([
    getAccountingPeriod(current),
    listAccountingPeriods(6),
    turnoverOverMonths(threshold.windowMonths),
  ])
  const monitor = vatMonitor(turnover)
  const vat = vatState()
  const deadlines = upcomingCompliance().filter((occurrence) => occurrence.reminding)

  const amount = (minor: number) => formatMoney(money(minor), 'bg')

  return (
    <>
      <PageHeader
        title="Счетоводство"
        description={`Текущ месец: ${month.label}. Всички суми са без ДДС — дружеството не е регистрирано по ЗДДС.`}
        actions={
          <>
            <Link href="/admin/accounting/expenses/new" className={button('primary')}>
              Добави разход
            </Link>
            <Link href={`/admin/accounting/periods/${current}`} className={button('secondary')}>
              Затвори месеца
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Продажби" value={amount(month.sales.revenueMinor)} note={`${month.sales.orderCount} поръчки`} />
        <Metric label="Разходи" value={amount(month.expenses.totalMinor)} note={`${month.expenses.count} записани`} />
        <Metric
          label="Неполучени пари"
          value={amount(month.sales.codOutstandingMinor)}
          note={`${month.sales.codOutstandingCount} пратки при куриера`}
        />
        <Metric
          label="Развалени продажби"
          value={String(month.sales.undoneCount)}
          note="отказани, върнати или сторнирани"
        />
      </div>

      <Section
        title={`Състояние на ${month.label}`}
        description={
          month.health.ready
            ? 'Няма нищо неуредено — месецът може да се предаде.'
            : `${month.health.blockers.length} ${month.health.blockers.length === 1 ? 'нещо чака' : 'неща чакат'} преди предаване.`
        }
        actions={
          <Badge tone={month.health.ready ? 'success' : 'warning'}>
            {labelOf(PERIOD_STATUSES, month.status)}
          </Badge>
        }
      >
        <ul className="space-y-1">
          {month.health.checks.map((check) => (
            <li key={check.key} className="flex items-start gap-2 py-1 text-xs">
              <span
                aria-hidden="true"
                className={`w-3 shrink-0 text-center ${
                  check.state === 'attention'
                    ? 'text-amber-700'
                    : check.state === 'done'
                      ? 'text-emerald-700'
                      : 'text-ink-ghost'
                }`}
              >
                {CHECK_MARK[check.state]}
              </span>
              <span className="w-44 shrink-0 text-ink-primary">{check.label}</span>
              <span className="min-w-0 flex-1 text-ink-secondary">{check.detail}</span>
              {check.href && check.state === 'attention' && (
                <Link href={check.href} className="shrink-0 underline">
                  оправи
                </Link>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
          <Link href={`/admin/accounting/periods/${current}`} className={button('primary')}>
            Подготви пакет за счетоводителя
          </Link>
          <Link href={`/admin/accounting/expenses?period=${current}`} className={button('secondary')}>
            Разходите на месеца
          </Link>
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Регистрация по ДДС"
          description={
            vat.registered
              ? 'Дружеството е регистрирано по ЗДДС.'
              : 'Дружеството не е регистрирано по ЗДДС и не начислява данък.'
          }
        >
          {monitor.level === 'unconfigured' ? (
            <div className="space-y-2 text-xs text-ink-secondary">
              <p>
                Прагът не е зададен, затова следенето е изключено. Не го попълвам сам: сумата се е
                променяла, зависи от годината и от начина на измерване, а грешна стойност или
                вдига фалшива тревога, или — по-лошо — мълчи.
              </p>
              <p>
                Вземи текущата стойност от счетоводителя ({monitor.legalSource}) и я задай като{' '}
                <code className="font-medium">ACCOUNTING_VAT_THRESHOLD_EUR</code>.
              </p>
              <p className="text-ink-ghost">
                Оборот за последните {monitor.windowMonths} месеца:{' '}
                <span className="font-medium tabular-nums">{amount(monitor.turnoverMinor)}</span>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <dl>
                <DetailRow label="Оборот">
                  <span className="font-medium tabular-nums">{amount(monitor.turnoverMinor)}</span>
                  <span className="text-ink-ghost"> за {monitor.windowMonths} месеца</span>
                </DetailRow>
                <DetailRow label="Зададен праг">
                  <span className="tabular-nums">{amount(monitor.thresholdMinor ?? 0)}</span>
                </DetailRow>
                <DetailRow label="Достигнато">
                  <span className="tabular-nums">
                    {Math.round((monitor.progress ?? 0) * 100)}%
                  </span>
                </DetailRow>
              </dl>

              <div
                className="h-1.5 overflow-hidden rounded-full bg-cream-muted"
                role="presentation"
              >
                <div
                  className={`h-full rounded-full ${
                    monitor.level === 'exceeded'
                      ? 'bg-red-400'
                      : monitor.level === 'approaching'
                        ? 'bg-amber-400'
                        : 'bg-clay'
                  }`}
                  style={{ width: `${Math.min(100, Math.round((monitor.progress ?? 0) * 100))}%` }}
                />
              </div>

              {monitor.level === 'exceeded' && (
                <Notice tone="danger">
                  Оборотът е минал зададения праг. Обади се на счетоводителя — регистрацията по ДДС
                  има срок, а дали и от кога се дължи, се преценява по {monitor.legalSource}.
                </Notice>
              )}
              {monitor.level === 'approaching' && (
                <Notice>
                  Оборотът наближава прага. Заслужава си разговор със счетоводителя отсега.
                </Notice>
              )}
              {monitor.level === 'normal' && (
                <p className="text-xs text-ink-ghost">
                  По зададената конфигурация. Прагът се потвърждава със счетоводител.
                </p>
              )}
            </div>
          )}
        </Section>

        <Section
          title="Наближаващи срокове"
          description="По зададена конфигурация — потвърди сроковете със счетоводителя."
          actions={
            <Link href="/admin/accounting/calendar" className={button('ghost', 'sm')}>
              Всички
            </Link>
          }
        >
          {deadlines.length === 0 ? (
            <p className="text-xs text-ink-secondary">Няма срок в следващите дни.</p>
          ) : (
            <ul className="space-y-2">
              {deadlines.map((occurrence) => (
                <li key={occurrence.rule.key} className="flex items-start justify-between gap-3 text-xs">
                  <span className="min-w-0">
                    <span className="block text-ink-primary">{occurrence.rule.title}</span>
                    <span className="block text-ink-ghost">{occurrence.rule.description}</span>
                  </span>
                  <Badge tone={occurrence.overdue ? 'danger' : occurrence.daysAway <= 3 ? 'warning' : 'neutral'}>
                    {occurrence.overdue
                      ? `изтече преди ${Math.abs(occurrence.daysAway)} дни`
                      : occurrence.daysAway === 0
                        ? 'днес'
                        : `след ${occurrence.daysAway} дни`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Месеци" description="Последните шест, с това, което всеки още чака.">
        <ul className="divide-y divide-border/60">
          {previous.map((entry) => (
            <PeriodRow key={entry.period} period={entry} />
          ))}
        </ul>
      </Section>
    </>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={`${panel} px-4 py-3`}>
      <p className="text-[11px] font-medium tracking-wide text-ink-ghost uppercase">{label}</p>
      <p className="mt-1 font-serif text-2xl leading-tight text-charcoal tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-ink-ghost">{note}</p>
    </div>
  )
}

function PeriodRow({ period }: { period: AccountingPeriod }) {
  const blockers = period.health.blockers.length

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs">
      <Link
        href={`/admin/accounting/periods/${period.period}`}
        className="w-40 shrink-0 font-medium underline-offset-2 hover:underline"
      >
        {formatPeriod(period.period)}
      </Link>
      <span className="text-ink-secondary tabular-nums">
        {period.sales.orderCount} поръчки · {formatMoney(money(period.sales.revenueMinor), 'bg')}
      </span>
      <span className="text-ink-secondary tabular-nums">
        {period.expenses.count} разхода · {formatMoney(money(period.expenses.totalMinor), 'bg')}
      </span>
      <span className="flex items-center gap-2">
        {blockers > 0 && (
          <Badge tone="warning">
            {blockers} {blockers === 1 ? 'неуредено' : 'неуредени'}
          </Badge>
        )}
        <Badge tone={period.status === 'open' ? 'neutral' : 'info'}>
          {labelOf(PERIOD_STATUSES, period.status)}
        </Badge>
      </span>
    </li>
  )
}
