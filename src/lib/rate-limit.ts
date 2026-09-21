import 'server-only'

/**
 * Shared in-process, best-effort rate limiter.
 *
 * Extracted so a third caller (`checkout/actions.ts`) doesn't duplicate the
 * same sliding-window map and cleanup dance a third time — `api/contact/route.ts`
 * and `app/admin/actions.ts` each already have their own independent copy of
 * this and are deliberately left as they are here; only the new call site uses
 * this module.
 *
 * Per-instance and resets on deploy, exactly like the two existing copies: a
 * courtesy speed bump against a crude flood, not a security control. A real
 * limiter needs shared state (e.g. a KV store keyed the same way).
 */
export interface RateLimiter {
  /** True when `key` has already used up its budget for the current window. */
  hit(key: string): boolean
}

export function createRateLimiter({
  windowMs,
  max,
}: {
  windowMs: number
  max: number
}): RateLimiter {
  const hits = new Map<string, number[]>()

  return {
    hit(key: string): boolean {
      const now = Date.now()
      const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs)

      if (recent.length >= max) {
        hits.set(key, recent)
        return true
      }

      recent.push(now)
      hits.set(key, recent)

      // Keep the map from growing without bound on a long-lived instance.
      if (hits.size > 5000) {
        for (const [k, times] of hits) {
          if (times.every((at) => now - at >= windowMs)) hits.delete(k)
        }
      }

      return false
    },
  }
}
