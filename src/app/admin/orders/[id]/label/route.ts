import { hasAdminSession } from '@/lib/admin-auth'
import { getOrderDetail } from '@/lib/admin-orders'
import { labelPdfUrl } from '@/lib/waybills'

/**
 * The waybill label PDF, served from our own domain (order-management back office).
 *
 * Exists for one reason: a PDF can only be sent to the printer by script from an
 * iframe of the **same origin**, and the label lives on Econt's domain. So the
 * admin's "Принтирай етикет" button asks this route, and this route asks Econt —
 * the same arrangement, and for a second reason, as `/api/couriers/.../offices`.
 *
 * **It lives under `/admin` rather than beside those other routes**, because the
 * session cookie is scoped to `ADMIN_COOKIE_PATH`. At `/api/admin/orders/[id]/label`
 * it was sent no cookie and answered 404 to a logged-in admin. `labelPath()` is
 * the one place the URL is written; see it.
 *
 * The second reason is that Econt's link is a **capability URL**: the numeric id
 * in it is the only thing guarding the file, there is no authentication on it,
 * and the ids are sequential. Putting it in the page's HTML published it to
 * anything that could read the page; behind this route it never leaves the
 * server, and the file sits behind the admin session like everything else.
 *
 * Two deliberate choices about what this answers:
 *
 * - **`404` for everything absent** — no session, no such order, no label
 *   recorded. The same answer to all three, because an outsider walking order
 *   ids should not be able to tell them apart.
 * - **`502` when Econt does not hand over a PDF**, which is *not* the same as an
 *   unsuccessful status. `PDFService.getPDF.json` answers `200 text/html` with an
 *   empty body for an id that is not ours (verified against the live service on
 *   2026-09-22), so `response.ok` proves nothing and the `%PDF` signature is the
 *   only proof taken. The same trap `speedy.ts` documents for its own API.
 *
 * Bodies are empty on both. The only caller is a `fetch()` in the admin that
 * reads the status, and an error page naming the courier, the order or the link
 * would be a disclosure for no benefit.
 *
 * Buffered rather than streamed, because the signature cannot be checked without
 * reading the first bytes and half a label is worse than none. A label is tens of
 * kilobytes.
 */

/** Uncached: one order's paperwork, behind a login, fetched when it is printed. */
export const dynamic = 'force-dynamic'

/**
 * Longer than a courier quote's budget and shorter than a booking's: nobody is
 * waiting on a checkout, but somebody *is* holding a print dialog open.
 */
const FETCH_TIMEOUT_MS = 10_000

/** No retries: Econt either serves the file or the admin presses the button again. */
const PDF_SIGNATURE = '%PDF'

const empty = (status: number) => new Response(null, { status })

/** The signature, not the `content-type`, which Econt does not set reliably. */
function isPdf(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < PDF_SIGNATURE.length) return false

  const head = new Uint8Array(bytes, 0, PDF_SIGNATURE.length)

  return String.fromCharCode(...head) === PDF_SIGNATURE
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAdminSession())) return empty(404)

  const { id } = await params
  const detail = await getOrderDetail(id)
  if (!detail) return empty(404)

  const url = labelPdfUrl(detail.events)
  if (!url) return empty(404)

  // `order.orderNumber` is what goes in any log line below. Never `url` — a log
  // line is not server-side enough for a capability URL: logs are pasted into
  // chats and tickets.
  const order = detail.order.orderNumber
  let bytes: ArrayBuffer

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error(`[label] order ${order}: Econt answered ${response.status} for the label`)

      return empty(502)
    }

    bytes = await response.arrayBuffer()
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error'
    console.error(`[label] order ${order}: the label could not be fetched — ${reason}`)

    return empty(502)
  }

  if (!isPdf(bytes)) {
    // The observed shape of "that id is not yours" — and of a label Econt has
    // since deleted, which is the same thing from here.
    console.error(`[label] order ${order}: Econt returned ${bytes.byteLength} bytes that are not a PDF`)

    return empty(502)
  }

  return new Response(bytes, {
    headers: {
      'content-type': 'application/pdf',
      // `inline`, because the point is to print it, not to collect it.
      'content-disposition': `inline; filename="tovaritelnitsa-${order}.pdf"`,
      'cache-control': 'no-store',
    },
  })
}
