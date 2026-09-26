import { isDatabaseConfigured } from '@/lib/env'
import {
  analyticsSecret,
  countryOf,
  dayKey,
  deviceOf,
  isBot,
  normalisePath,
  optedOut,
  referrerHostOf,
  visitorHash,
} from '@/lib/analytics'
import { recordPageView } from '@/lib/analytics-data'

/**
 * One storefront page opened — posted by `PageViewBeacon`.
 *
 * Always answers 204, whether the view was counted or not: the browser does
 * nothing with the reply, and telling a script which of its posts were dropped
 * only helps it get past the filters. What is recorded, and why it identifies
 * nobody, is in `src/lib/analytics.ts`.
 *
 * Named `visit` rather than anything with "analytics" or "track" in it, which is
 * what blocklists match on — this endpoint sends nothing to a third party, and
 * a blocked beacon would only make the shop's own numbers wrong.
 */

// In-process speed bump against one client inflating the numbers, with the
// same per-instance caveat as the contact form's. Generous: a customer
// browsing the whole catalogue opens a page every few seconds.
const WINDOW_MS = 10 * 60_000
const MAX_PER_WINDOW = 120
const hits = new Map<string, number[]>()

function rateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS)
  recent.push(now)
  hits.set(key, recent)

  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every((at) => now - at >= WINDOW_MS)) hits.delete(k)
    }
  }

  return recent.length > MAX_PER_WINDOW
}

const done = () => new Response(null, { status: 204 })

export async function POST(request: Request) {
  const { headers } = request
  const userAgent = headers.get('user-agent') ?? ''
  const ip = headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ''

  // A browser marks its own same-origin fetches; anything else posting here is
  // another site or a script.
  const site = headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return done()

  if (isBot(userAgent) || optedOut(headers)) return done()

  const secret = analyticsSecret()
  if (!secret || !isDatabaseConfigured) return done()

  if (rateLimited(ip || 'unknown')) return done()

  let payload: { path?: unknown; referrer?: unknown; entry?: unknown }
  try {
    // `sendBeacon` posts text/plain, so the body is read as text either way.
    payload = JSON.parse(await request.text())
  } catch {
    return done()
  }
  if (!payload || typeof payload !== 'object') return done()

  const path = normalisePath(payload.path)
  if (!path) return done()

  const entry = payload.entry === true
  const now = new Date()

  try {
    await recordPageView({
      path,
      entry,
      referrerHost: entry
        ? referrerHostOf(payload.referrer, headers.get('host') ?? new URL(request.url).host)
        : '',
      country: countryOf(headers.get('x-vercel-ip-country')),
      device: deviceOf(userAgent),
      visitorHash: visitorHash(secret, dayKey(now), ip, userAgent),
      createdAt: now,
    })
  } catch (error) {
    // A lost page view is not worth a customer-facing error, but a table that
    // is missing (a migration not run) should show up in the logs.
    console.error('[visit] could not record a page view', error)
  }

  return done()
}
