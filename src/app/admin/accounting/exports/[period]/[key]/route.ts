import { hasAdminSession } from '@/lib/admin-auth'
import { csvResponse } from '@/lib/accounting/csv'
import { buildExport, exportFiles } from '@/lib/accounting/exports'
import { isPeriodKey } from '@/lib/accounting/period-key'

/**
 * One month's report, as a file.
 *
 * Under `/admin` rather than beside the other API routes, for the reason the
 * label route learned the hard way: the session cookie is scoped to
 * `ADMIN_COOKIE_PATH`, and an endpoint outside it is handed no cookie and
 * answers as if nobody were logged in.
 *
 * `404` to everything absent — no session, not a month, not a report this build
 * serves — because these files are the shop's books and an unauthenticated
 * caller should not be able to tell a wrong period from a missing one.
 *
 * Built on request rather than stored. A month's CSV is a projection of rows
 * that already exist, so generating it twice gives the same file, and keeping a
 * copy would only create something that can fall out of date.
 */

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ period: string; key: string }> }
) {
  if (!(await hasAdminSession())) return new Response(null, { status: 404 })

  const { period, key } = await params

  if (!isPeriodKey(period)) return new Response(null, { status: 404 })

  const file = exportFiles(period).find((candidate) => candidate.key === key)
  if (!file) return new Response(null, { status: 404 })

  const table = await buildExport(key, period)
  if (!table) return new Response(null, { status: 404 })

  return csvResponse(file.filename, table)
}
