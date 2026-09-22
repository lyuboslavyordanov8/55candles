import { requireAdmin } from '@/lib/admin-auth'
import { upcomingCompliance } from '@/lib/accounting/config'
import { Badge, PageHeader, Section, table, tableWrap, td, th, tr } from '@/components/admin/ui'

/**
 * The deadlines the shop is reminded about.
 *
 * Organising, not advising. Every row says where its date comes from, and every
 * row whose source is an act carries „потвърди със счетоводител“ until somebody
 * has — `lastVerifiedOn` in `COMPLIANCE_RULES`, which is `null` for all of them
 * today and will show a date once it is not.
 *
 * Two of the rules are the shop's own housekeeping and say so by having no legal
 * source at all. Dressing those up as obligations would be the interface
 * inventing law.
 */

export const metadata = {
  title: 'Счетоводен календар',
  robots: { index: false, follow: false, nocache: true },
}

const dateFormat = new Intl.DateTimeFormat('bg-BG', { dateStyle: 'long' })

export default async function ComplianceCalendarPage() {
  await requireAdmin()

  const occurrences = upcomingCompliance()

  return (
    <>
      <PageHeader
        title="Счетоводен календар"
        back={{ href: '/admin/accounting', label: 'счетоводство' }}
        description="Напомняния по зададена конфигурация. Системата подрежда и напомня — не дава счетоводен или правен съвет."
      />

      <div className={`${tableWrap} overflow-x-auto`}>
        <table className={table}>
          <thead className="bg-cream-surface/60">
            <tr>
              <th className={th}>Срок</th>
              <th className={th}>Какво</th>
              <th className={th}>Остават</th>
              <th className={th}>Основание</th>
              <th className={th}>Проверено</th>
            </tr>
          </thead>
          <tbody>
            {occurrences.map((occurrence) => (
              <tr key={occurrence.rule.key} className={tr}>
                <td className={`${td} whitespace-nowrap tabular-nums`}>
                  {dateFormat.format(occurrence.dueOn)}
                </td>
                <td className={td}>
                  <span className="block text-ink-primary">{occurrence.rule.title}</span>
                  <span className="block text-ink-ghost">{occurrence.rule.description}</span>
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  <Badge
                    tone={
                      occurrence.overdue
                        ? 'danger'
                        : occurrence.daysAway <= 7
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {occurrence.overdue
                      ? `изтекъл преди ${Math.abs(occurrence.daysAway)} дни`
                      : occurrence.daysAway === 0
                        ? 'днес'
                        : `${occurrence.daysAway} дни`}
                  </Badge>
                </td>
                <td className={td}>
                  {occurrence.rule.legalSource ?? (
                    <span className="text-ink-ghost">вътрешна рутина</span>
                  )}
                </td>
                <td className={td}>
                  {occurrence.rule.lastVerifiedOn ? (
                    <span className="tabular-nums">{occurrence.rule.lastVerifiedOn}</span>
                  ) : occurrence.rule.legalSource ? (
                    <span className="text-amber-800">потвърди със счетоводител</span>
                  ) : (
                    <span className="text-ink-ghost">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Section title="Как се променят">
        <p className="text-xs text-ink-secondary">
          Всички правила са в <code className="font-medium">src/lib/accounting/config.ts</code> —
          заглавие, описание, дата, отстъпки за напомняне, основание и дата на последна проверка.
          Нито едно законово число не стои в екран: сменя се на едно място, когато
          законодателството се промени, и това е единственото място за търсене.
        </p>
      </Section>
    </>
  )
}
