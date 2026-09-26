import { requireAdmin } from '@/lib/admin-auth'
import { isOrderStorageReady } from '@/lib/orders'
import { analyticsSecret, pageLabel, type Device } from '@/lib/analytics'
import {
  loadTrafficReport,
  pruneOldPageViews,
  REPORT_DAYS,
  type Tally,
  type TrafficReport,
} from '@/lib/analytics-data'
import { Notice, PageHeader, panel, Section, table, td, th, tr } from '@/components/admin/ui'

/**
 * Visits to the storefront, counted by the shop itself (`src/lib/analytics.ts`).
 *
 * The numbers answer the owner's questions — is anyone coming, from where, to
 * which candle, and does it turn into orders — and nothing finer: there is no
 * per-visitor view, because nothing recorded could make one.
 *
 * "Посетители" are visitor-days throughout, and the page says so once, where
 * the figures are: it is the one thing about them that would otherwise mislead.
 */

const DEVICE_LABELS: Record<Device, string> = {
  mobile: 'Телефон',
  tablet: 'Таблет',
  desktop: 'Компютър',
}

const regions = new Intl.DisplayNames(['bg'], { type: 'region' })
const dayLabel = new Intl.DateTimeFormat('bg-BG', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const number = new Intl.NumberFormat('bg-BG')

function countryLabel(code: string): string {
  if (!code) return 'Неизвестна'
  try {
    return regions.of(code) ?? code
  } catch {
    return code
  }
}

export default async function TrafficPage() {
  await requireAdmin()

  if (!isOrderStorageReady()) {
    return (
      <Notice>Няма настроена база данни (DATABASE_URL) — посещенията няма къде да се пазят.</Notice>
    )
  }

  let report: TrafficReport
  try {
    await pruneOldPageViews()
    report = await loadTrafficReport()
  } catch (error) {
    console.error('[traffic] could not load the report', error)
    return (
      <>
        <PageHeader title="Трафик" />
        <Notice tone="danger">
          Посещенията не могат да се прочетат. Най-вероятно миграцията за таблицата page_views не е
          пусната (npm run db:migrate).
        </Notice>
      </>
    )
  }

  const conversion = report.month.visitors ? (report.orders / report.month.visitors) * 100 : 0
  const peak = Math.max(1, ...report.days.map((day) => day.views))

  return (
    <>
      <PageHeader
        title="Трафик"
        description={`Посещенията в сайта за последните ${REPORT_DAYS} дни. Броят се без бисквитки и без да се пазят IP адреси.`}
      />

      {!analyticsSecret() && (
        <Notice>
          Няма ADMIN_SESSION_SECRET или ANALYTICS_SALT (поне 16 знака), затова посещенията не се
          броят.
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Днес" tally={report.today} />
        <Metric label="7 дни" tally={report.week} />
        <Metric label={`${REPORT_DAYS} дни`} tally={report.month} />
        <div className={`${panel} px-4 py-3`}>
          <p className="text-[11px] font-medium tracking-wide text-ink-ghost uppercase">
            Поръчки / посетители
          </p>
          <p className="mt-1 font-serif text-2xl leading-tight text-charcoal tabular-nums">
            {conversion.toLocaleString('bg-BG', { maximumFractionDigits: 1 })}%
          </p>
          <p className="mt-0.5 text-xs text-ink-ghost">
            {number.format(report.orders)} поръчки за {REPORT_DAYS} дни
          </p>
        </div>
      </div>

      <p className="text-xs text-ink-ghost">
        „Посетител“ е едно устройство в рамките на един ден: който дойде в понеделник и във вторник,
        се брои два пъти. Сайтът не разпознава никого от ден на ден — нарочно.
      </p>

      <Section title="По дни" description="Височината е прегледите; тъмната част — посетителите.">
        <div className="px-4 py-4">
          <div className="flex h-40 items-end gap-[3px]">
            {report.days.map((day) => (
              <div
                key={day.day}
                title={`${dayLabel.format(new Date(day.day))}: ${day.views} прегледа, ${day.visitors} посетители`}
                className="relative flex h-full flex-1 items-end"
              >
                <div
                  className="relative w-full rounded-t-sm bg-brand-sand/35"
                  style={{ height: `${(day.views / peak) * 100}%` }}
                >
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t-sm bg-brand-sand"
                    style={{ height: day.views ? `${(day.visitors / day.views) * 100}%` : 0 }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-ink-ghost">
            <span>{dayLabel.format(new Date(report.days[0].day))}</span>
            <span>днес</span>
          </div>
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Най-гледани страници">
          <Rows
            head={['Страница', 'Прегледи', 'Посетители']}
            rows={report.pages.map((page) => [
              <span key="label">
                {pageLabel(page.path)}
                <span className="block text-[10px] text-ink-ghost">{page.path}</span>
              </span>,
              page.views,
              page.visitors,
            ])}
          />
        </Section>

        <Section
          title="Откъде идват"
          description="По първата страница на всяко посещение. „Директно“ е без препращащ сайт — изписан адрес, отметка, приложение."
        >
          <Rows
            head={['Източник', 'Посещения']}
            rows={report.sources.map((source) => [source.label, source.visits])}
          />
        </Section>

        <Section title="Държави">
          <Rows
            head={['Държава', 'Посетители']}
            rows={report.countries.map((row) => [countryLabel(row.country), row.visitors])}
          />
        </Section>

        <Section title="Устройства">
          <Rows
            head={['Устройство', 'Посетители']}
            rows={report.devices.map((row) => [
              DEVICE_LABELS[row.device] ?? row.device,
              row.visitors,
            ])}
          />
        </Section>
      </div>
    </>
  )
}

function Metric({ label, tally }: { label: string; tally: Tally }) {
  return (
    <div className={`${panel} px-4 py-3`}>
      <p className="text-[11px] font-medium tracking-wide text-ink-ghost uppercase">{label}</p>
      <p className="mt-1 font-serif text-2xl leading-tight text-charcoal tabular-nums">
        {number.format(tally.visitors)}
        <span className="ml-1.5 font-sans text-xs text-ink-ghost">посетители</span>
      </p>
      <p className="mt-0.5 text-xs text-ink-ghost">{number.format(tally.views)} прегледа</p>
    </div>
  )
}

function Rows({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-center text-xs text-ink-ghost">Още няма посещения.</p>
  }

  return (
    <table className={table}>
      <thead>
        <tr>
          {head.map((label, index) => (
            <th key={label} className={`${th} ${index > 0 ? 'text-right' : ''}`}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, rowIndex) => (
          <tr key={rowIndex} className={tr}>
            {cells.map((cell, index) => (
              <td key={index} className={`${td} ${index > 0 ? 'text-right tabular-nums' : ''}`}>
                {typeof cell === 'number' ? number.format(cell) : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
