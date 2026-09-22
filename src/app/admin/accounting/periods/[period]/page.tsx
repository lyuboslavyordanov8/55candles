import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireAdmin } from '@/lib/admin-auth'
import { formatMoney, money } from '@/lib/money'
import { changedSince, listAccountingEvents } from '@/lib/accounting/audit'
import { exportFiles } from '@/lib/accounting/exports'
import { isPeriodKey } from '@/lib/accounting/period-key'
import { getAccountingPeriod } from '@/lib/accounting/periods'
import { accountantSettingsFor } from '@/lib/accounting/settings'
import { ACCOUNTANT_REQUIREMENTS } from '@/lib/accounting/config'
import { labelOf, PERIOD_STATUSES } from '@/lib/accounting/vocabulary'
import { advancePeriod, markPackagePrepared, savePeriodNote } from '../../actions'
import {
  Badge,
  button,
  DetailRow,
  fieldLabel,
  Notice,
  PageHeader,
  Section,
  textarea,
} from '@/components/admin/ui'

/**
 * One month, closed.
 *
 * The page the owner opens once a month and should be able to finish in a couple
 * of minutes: what the month contains, what it still lacks, the files to send,
 * and one button that records that they were sent.
 *
 * ## The export is a list of files, not an archive
 *
 * Zipping needs a dependency and the accountant receives the same five CSVs
 * either way. What the shop *does* record is the moment a package was prepared —
 * an `export.created` event — which is what makes "данните се промениха след
 * последния пакет" answerable without storing a second copy of the month. Every
 * preparation stays in the audit trail; nothing overwrites anything.
 */

export const metadata = {
  title: 'Счетоводен месец',
  robots: { index: false, follow: false, nocache: true },
}

const dateFormat = new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium', timeStyle: 'short' })

export default async function AccountingPeriodPage({
  params,
  searchParams,
}: {
  params: Promise<{ period: string }>
  searchParams: Promise<{ error?: string; moved?: string; noted?: string; exported?: string }>
}) {
  await requireAdmin()

  const { period } = await params
  if (!isPeriodKey(period)) notFound()

  const { error, moved, noted, exported } = await searchParams

  const [month, accountant, events] = await Promise.all([
    getAccountingPeriod(period),
    accountantSettingsFor(),
    listAccountingEvents({ period }, 40),
  ])

  const lastExport = events.find((event) => event.action === 'export.created')
  const changes = lastExport ? await changedSince(period, lastExport.createdAt) : []

  const amount = (minor: number) => formatMoney(money(minor), 'bg')
  const wanted = ACCOUNTANT_REQUIREMENTS.filter((requirement) =>
    accountant.requirements.includes(requirement.key)
  )
  const files = exportFiles(period).filter((file) =>
    wanted.some((requirement) => requirement.key === file.requirement)
  )

  return (
    <>
      <PageHeader
        title={month.label}
        back={{ href: '/admin/accounting', label: 'счетоводство' }}
        description={
          month.current
            ? 'Текущият месец — още влизат поръчки.'
            : 'Приключил месец. Данните вече не се променят от магазина.'
        }
        meta={<Badge tone={month.status === 'open' ? 'neutral' : 'info'}>{labelOf(PERIOD_STATUSES, month.status)}</Badge>}
      />

      {error === 'blocked' && (
        <Notice>
          Месецът има неуредени неща. Оправи ги или отметни „предай въпреки това“ — тогава се
          записва кой е решил да го предаде така.
        </Notice>
      )}
      {error === 'failed' && <Notice>Статусът не беше записан. Опитай отново.</Notice>}
      {moved && (
        <Notice tone="success">
          Месецът е отбележен като „{labelOf(PERIOD_STATUSES, moved)}“.
        </Notice>
      )}
      {noted && <Notice tone="success">Бележката е записана.</Notice>}
      {exported && (
        <Notice tone="success">
          Записано: пакетът за {month.label} е подготвен. Изтегли файловете отдолу и ги изпрати
          {accountant.email ? ` на ${accountant.email}` : ' на счетоводителя'}.
        </Notice>
      )}

      {changes.length > 0 && (
        <Notice>
          Данните за месеца са се променили след последния подготвен пакет (
          {dateFormat.format(lastExport!.createdAt)}) — {changes.length}{' '}
          {changes.length === 1 ? 'промяна' : 'промени'}. Ако вече си изпратил файловете, подготви
          нов пакет.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Месецът в числа">
          <dl>
            <DetailRow label="Продажби">
              <span className="font-medium tabular-nums">{amount(month.sales.revenueMinor)}</span>
              <span className="text-ink-ghost"> от {month.sales.orderCount} поръчки</span>
            </DetailRow>
            <DetailRow label="в т.ч. стоки">
              <span className="tabular-nums">{amount(month.sales.goodsMinor)}</span>
            </DetailRow>
            <DetailRow label="в т.ч. доставка">
              <span className="tabular-nums">{amount(month.sales.shippingMinor)}</span>
            </DetailRow>
            {month.sales.discountMinor > 0 && (
              <DetailRow label="отстъпки">
                <span className="tabular-nums">−{amount(month.sales.discountMinor)}</span>
              </DetailRow>
            )}
            <DetailRow label="Разходи">
              <span className="font-medium tabular-nums">{amount(month.expenses.totalMinor)}</span>
              <span className="text-ink-ghost"> от {month.expenses.count} записани</span>
            </DetailRow>
            <DetailRow label="Фактури">
              <span className="tabular-nums">{month.invoices.count}</span>
              {month.invoices.count > 0 && (
                <span className="text-ink-ghost"> · {amount(month.invoices.totalMinor)}</span>
              )}
            </DetailRow>
            <DetailRow label="Получени пари">
              <span className="tabular-nums">{amount(month.sales.codReconciledMinor)}</span>
            </DetailRow>
            <DetailRow label="Още при куриера">
              <span className="tabular-nums">{amount(month.sales.codOutstandingMinor)}</span>
            </DetailRow>
            <DetailRow label="Развалени">
              <span className="tabular-nums">{month.sales.undoneCount}</span>
              <span className="text-ink-ghost"> поръчки (сума не се записва)</span>
            </DetailRow>
          </dl>
        </Section>

        <Section
          title="Какво още чака"
          actions={
            <Badge tone={month.health.ready ? 'success' : 'warning'}>
              {month.health.ready ? 'готов' : `${month.health.blockers.length} неуредени`}
            </Badge>
          }
        >
          <ul className="space-y-1.5">
            {month.health.checks.map((check) => (
              <li key={check.key} className="flex items-start gap-2 text-xs">
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
                  {check.state === 'attention' ? '⚠' : check.state === 'done' ? '✓' : '·'}
                </span>
                <span className="w-40 shrink-0 text-ink-primary">{check.label}</span>
                <span className="min-w-0 flex-1 text-ink-secondary">{check.detail}</span>
                {check.href && check.state === 'attention' && (
                  <Link href={check.href} className="shrink-0 underline">
                    оправи
                  </Link>
                )}
              </li>
            ))}
          </ul>

          {month.overriddenAt && (
            <p className="mt-3 border-t border-border/60 pt-3 text-xs text-ink-ghost">
              Предаден с неуредени неща от {month.overriddenBy} на{' '}
              {dateFormat.format(month.overriddenAt)}.
            </p>
          )}
        </Section>
      </div>

      <Section
        title="Пакет за счетоводителя"
        description={
          accountant.name
            ? `За ${accountant.name}${accountant.email ? ` · ${accountant.email}` : ''}. Съдържанието следва списъка в настройките.`
            : 'Съдържанието следва списъка в настройките. Счетоводителят още не е въведен.'
        }
        actions={
          <Link href="/admin/accounting/settings" className={button('ghost', 'sm')}>
            Настройки
          </Link>
        }
      >
        <ul className="space-y-1.5">
          {files.map((file) => (
            <li key={file.key} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-ink-primary">{file.label}</span>
              <span className="flex items-center gap-3">
                <code className="text-[11px] text-ink-ghost">{file.filename}</code>
                <a
                  href={`/admin/accounting/exports/${period}/${file.key}`}
                  className={button('secondary', 'sm')}
                >
                  Изтегли
                </a>
              </span>
            </li>
          ))}
        </ul>

        {wanted.some((requirement) => !requirement.available) && (
          <div className="mt-4 border-t border-border/60 pt-3">
            <p className="text-[11px] font-medium tracking-wide text-ink-ghost uppercase">
              Ръчно, извън системата
            </p>
            <ul className="mt-1.5 space-y-1 text-xs">
              {wanted
                .filter((requirement) => !requirement.available)
                .map((requirement) => (
                  <li key={requirement.key} className="text-ink-secondary">
                    <span className="text-ink-primary">{requirement.label}</span> —{' '}
                    {requirement.unavailableReason}
                  </li>
                ))}
            </ul>
          </div>
        )}

        <form action={markPackagePrepared} className="mt-4 border-t border-border/60 pt-4">
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="files" value={files.map((file) => file.key).join(',')} />
          <button type="submit" className={button('primary', 'lg')}>
            Отбележи пакета като подготвен
          </button>
          <span className="mt-1.5 block text-xs text-ink-ghost">
            Записва датата, за да се вижда после дали данните са се променили след нея. Файловете
            се изтеглят отгоре.
          </span>
        </form>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Статус на месеца">
          <div className="flex flex-wrap gap-2">
            {PERIOD_STATUSES.filter((entry) => entry.key !== month.status).map((entry) => (
              <form key={entry.key} action={advancePeriod}>
                <input type="hidden" name="period" value={period} />
                <input type="hidden" name="status" value={entry.key} />
                <button type="submit" className={button('secondary')}>
                  {entry.label}
                </button>
              </form>
            ))}
          </div>

          {!month.health.ready && (
            <form action={advancePeriod} className="mt-4 border-t border-border/60 pt-4">
              <input type="hidden" name="period" value={period} />
              <input type="hidden" name="status" value="ready" />
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" name="override" className="mt-0.5 size-4 accent-charcoal" />
                <span>
                  <span className="font-medium text-ink-primary">
                    Предай въпреки неуредените неща
                  </span>
                  <span className="mt-0.5 block text-ink-ghost">
                    Записва се кой и кога го е решил, заедно с това какво е било неуредено.
                  </span>
                </span>
              </label>
              <button type="submit" className={`${button('danger')} mt-2`}>
                Готов за счетоводител
              </button>
            </form>
          )}
        </Section>

        <Section title="Бележка за месеца">
          <form action={savePeriodNote} className="space-y-2">
            <input type="hidden" name="period" value={period} />
            <label className="block">
              <span className={fieldLabel}>Каквото счетоводителят трябва да знае</span>
              <textarea
                name="note"
                rows={4}
                maxLength={1000}
                defaultValue={month.note}
                className={textarea}
              />
            </label>
            <button type="submit" className={button('secondary')}>
              Запиши бележката
            </button>
          </form>
        </Section>
      </div>

      <Section title="История на месеца" description="Какво е правено по книгите и от кого.">
        {events.length === 0 ? (
          <p className="text-xs text-ink-secondary">Още няма записани действия за този месец.</p>
        ) : (
          <ol className="space-y-0">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 py-2 text-xs last:border-0"
              >
                <span className="text-ink-ghost tabular-nums">
                  {dateFormat.format(event.createdAt)}
                </span>
                <span className="text-ink-primary">{event.action}</span>
                <span className="text-ink-ghost">{event.actor}</span>
                {/* Both operands boolean: `unknown && jsx` is not a ReactNode. */}
                {typeof event.detail === 'object' && event.detail !== null && (
                  <code className="w-full break-all text-[11px] text-ink-ghost">
                    {Object.entries(event.detail as Record<string, unknown>)
                      .filter(([, value]) => value !== null && value !== undefined && value !== '')
                      .map(([key, value]: [string, unknown]) => `${key}: ${String(value)}`)
                      .join(' · ')}
                  </code>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  )
}
