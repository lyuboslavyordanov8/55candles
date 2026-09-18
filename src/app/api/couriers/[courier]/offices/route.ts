import { courierClient } from '@/lib/couriers'
import type { CourierCity, CourierOffice, LookupResult } from '@/lib/couriers/types'
import { COURIERS, type Courier } from '@/lib/shipping'

/**
 * Courier city and office lookup for the checkout picker (AUDIT.md Q-22, B-13).
 *
 * Exists because the courier APIs are credentialed. The picker is a Client
 * Component and must never hold merchant credentials, so it asks this route and
 * this route asks the courier — `src/lib/couriers/` is marked `server-only`
 * precisely so that arrangement cannot be short-circuited.
 *
 * Two shapes, one endpoint, because they are two steps of one interaction:
 *
 *   GET ?city=Русе                 → { cities: [...] }
 *   GET ?cityId=35&kind=office     → { offices: [...] }
 *
 * Status codes follow `/api/contact`: 200 with data, **503** when the courier
 * is not configured, **502** when the lookup failed. The distinction matters to
 * the form — "not connected yet" is permanent and it should fall back to a text
 * field, "the lookup failed" is transient and worth offering a retry.
 *
 * No rate limit, deliberately, unlike `/api/contact`. That endpoint sends mail
 * on demand; this one filters a list the courier client already holds in memory
 * for six hours, so a flood cannot reach Econt, cannot cost money, and cannot
 * disclose anything — office addresses are public. Adding a limiter here would
 * be ceremony, and it would be the wrong one: the thing worth bounding is calls
 * to the courier, which the cache in `econt.ts` already bounds.
 */

/** Uncached: `GET` handlers are dynamic by default in Next 16, which is right
 * here — the response depends on the query, and the expensive part (the courier
 * download) is cached one layer down. */
export const dynamic = 'force-dynamic'

const OFFICE_KINDS = ['office', 'locker'] as const

/** Longest query we will look at. Anything more is not a Bulgarian place name. */
const MAX_QUERY_LENGTH = 100

function isCourier(value: string): value is Courier {
  return (COURIERS as readonly string[]).includes(value)
}

function isKind(value: string): value is CourierOffice['kind'] {
  return (OFFICE_KINDS as readonly string[]).includes(value)
}

/**
 * One `LookupResult` to one HTTP response.
 *
 * Centralised so the two query shapes cannot drift into reporting the same
 * courier outage differently.
 */
function respond<T>(result: LookupResult<T>, key: 'cities' | 'offices'): Response {
  if (result.status === 'ok') {
    return Response.json({ [key]: result.data }, { status: 200 })
  }

  if (result.status === 'unconfigured') {
    return Response.json(
      { error: 'unconfigured', courier: result.courier },
      { status: 503 }
    )
  }

  // Worth a log line: a courier outage during checkout is an operational event,
  // and the customer only ever sees a fallback text field.
  console.error(`[couriers] ${result.courier} lookup failed: ${result.reason}`)

  return Response.json({ error: 'failed', courier: result.courier }, { status: 502 })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courier: string }> }
) {
  const { courier } = await params

  if (!isCourier(courier)) {
    return Response.json({ error: 'unknownCourier' }, { status: 404 })
  }

  const query = new URL(request.url).searchParams
  const client = courierClient(courier)

  const cityQuery = query.get('city')

  if (cityQuery !== null) {
    if (cityQuery.length > MAX_QUERY_LENGTH) {
      return Response.json({ error: 'queryTooLong' }, { status: 400 })
    }

    return respond<CourierCity[]>(await client.searchCities(cityQuery), 'cities')
  }

  const cityId = query.get('cityId')
  const kind = query.get('kind')

  if (cityId && kind && isKind(kind)) {
    return respond<CourierOffice[]>(await client.officesIn(cityId, kind), 'offices')
  }

  // Neither shape matched. A picker that reaches this has a bug, and a 400 with
  // a name is easier to debug than an empty list that looks like "no offices".
  return Response.json({ error: 'badQuery' }, { status: 400 })
}
