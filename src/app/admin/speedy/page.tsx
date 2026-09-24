import { requireAdmin } from '@/lib/admin-auth'
import { formatPeriod } from '@/lib/accounting/period-key'
import { formatMoney, money } from '@/lib/money'
import { isOrderStorageReady } from '@/lib/orders'
import { SPEEDY_CONTRACT, type SpeedyMonth } from '@/lib/speedy-contract'
import { loadSpeedyContractReport } from '@/lib/speedy-contract-data'
import {
  Badge,
  Notice,
  PageHeader,
  Section,
  table,
  tableWrap,
  td,
  th,
  tr,
  type Tone,
} from '@/components/admin/ui'

/**
 * Whether the shop is keeping to its Speedy contract.
 *
 * Only the clauses that depend on the shop — turnover, gaps, the renewal
 * threshold, the credit limit, the касов бон — each with the clause or the
 * email it comes from. The figures are Speedy's own quotes at booking, so this
 * is an estimate until it is checked against Speedy's invoice, and says so.
 */

export const metadata = {
  title: 'Договор Speedy',
  robots: { index: false, follow: false, nocache: true },
}

const MONTH_STATE: Record<SpeedyMonth['state'], { tone: Tone; label: string }> = {
  ok: { tone: 'success', label: 'над минимума' },
  under: { tone: 'danger', label: 'под минимума' },
  not_yet: { tone: 'neutral', label: 'под минимума, още не важи' },
  idle: { tone: 'neutral', label: 'без пратки, не се брои' },
}

export default async function SpeedyContractPage() {
  await requireAdmin()

  if (!isOrderStorageReady()) {
    return <Notice>Няма настроена база данни (DATABASE_URL), така че няма пратки за проверка.</Notice>
  }

  const report = await loadSpeedyContractReport()
  const amount = (minor: number) => formatMoney(money(minor), 'bg')

  return (
    <>
      <PageHeader
        title="Договор Speedy"
        description={`Договор №${SPEEDY_CONTRACT.number} от 24 септември 2026. Тук са само условията, които зависят от нас.`}
      />

      <Section title="Проверки">
        <ul className="divide-y divide-border/60">
          {report.checks.map((check) => (
            <li key={check.key} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
              <Badge tone={check.tone} className="mt-0.5">
                {TONE_LABEL[check.tone]}
              </Badge>
              <div className="min-w-0 flex-1 basis-72 text-xs">
                <p className="font-medium text-ink-primary">{check.title}</p>
                <p className="mt-0.5 text-ink-secondary">{check.text}</p>
                <p className="mt-0.5 text-ink-ghost">Основание: {check.source}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <div className={`${tableWrap} overflow-x-auto`}>
        <table className={table}>
          <thead className="bg-cream-surface/60">
            <tr>
              <th className={th}>Месец</th>
              <th className={`${th} text-right`}>Пратки</th>
              <th className={`${th} text-right`}>Доставени</th>
              <th className={`${th} text-right`}>Оборот без ДДС</th>
              <th className={th}>Спрямо {amount(SPEEDY_CONTRACT.minMonthlyTurnoverMinor)}</th>
            </tr>
          </thead>
          <tbody>
            {report.months.map((month) => (
              <tr key={month.period} className={tr}>
                <td className={`${td} whitespace-nowrap`}>{formatPeriod(month.period)}</td>
                <td className={`${td} text-right tabular-nums`}>{month.parcels}</td>
                <td className={`${td} text-right tabular-nums`}>{month.delivered}</td>
                <td className={`${td} text-right tabular-nums`}>
                  {amount(month.turnoverMinor)}
                  {month.unpriced > 0 && (
                    <span className="block text-ink-ghost">{month.unpriced} без цена</span>
                  )}
                </td>
                <td className={td}>
                  <Badge tone={MONTH_STATE[month.state].tone}>{MONTH_STATE[month.state].label}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Section title="Как се смята">
        <p className="text-xs text-ink-secondary">
          Броят се товарителниците за Speedy, издадени от админа, без отказаните поръчки. Оборотът е
          цената, която Speedy е върнал при издаването, без 20% ДДС. Включва таксата за наложен
          платеж и надбавките, които Speedy е посочил в цената. Това е оценка. Меродавна е фактурата на Speedy. Пратките, създадени ръчно в MySpeedy, не се
          виждат тук. Условията са в <code className="font-medium">src/lib/speedy-contract.ts</code>.
        </p>
      </Section>
    </>
  )
}

const TONE_LABEL: Record<Tone, string> = {
  success: 'наред',
  info: 'за сведение',
  warning: 'внимание',
  danger: 'спешно',
  neutral: '—',
}
