import 'server-only'

/**
 * The one HTTP call both courier clients make (AUDIT.md B-13 step 8).
 *
 * Every courier endpoint we use is `POST` with a JSON body, so there is exactly
 * one shape to get right. It lives here rather than in each client so the
 * failure policy is written once:
 *
 * - **Always a timeout.** A courier that accepts the connection and never
 *   answers would otherwise hold a checkout request open until the platform
 *   kills it. A slow lookup must degrade to "type the office name", not to a
 *   hung page.
 * - **Retry only what retrying can fix** — a network error, a 5xx, or a 429.
 *   Retrying a 4xx re-sends the same rejected request and doubles the latency
 *   of an error the customer is already waiting on.
 * - **Never throw.** Callers turn the result into a `LookupResult`, and an
 *   exception escaping into a Server Component render is a 500 for a feature
 *   the page can live without.
 */

export type HttpResult<T> = { ok: true; data: T } | { ok: false; reason: string }

export interface PostJsonOptions {
  url: string
  body: unknown
  /** HTTP Basic credentials. Both couriers authenticate per request. */
  auth?: { username: string; password: string }
  timeoutMs?: number
  /** Total attempts, including the first. */
  attempts?: number
}

const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_ATTEMPTS = 3
const BASE_BACKOFF_MS = 200

/** Status codes where the same request might succeed if sent again. */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

function backoffMs(attempt: number): number {
  // Exponential, with jitter so concurrent checkouts do not retry in lockstep
  // and turn a courier's brief overload into a self-inflicted thundering herd.
  const exponential = BASE_BACKOFF_MS * 2 ** (attempt - 1)
  return exponential + Math.random() * BASE_BACKOFF_MS
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

export async function postJson<T>({
  url,
  body,
  auth,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  attempts = DEFAULT_ATTEMPTS,
}: PostJsonOptions): Promise<HttpResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  if (auth) {
    headers.Authorization = basicAuth(auth.username, auth.password)
  }

  let lastReason = 'no attempt was made'

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // A per-attempt controller, so the timeout applies to each try rather than
    // to the whole sequence — and is cleared on success so a resolved request
    // does not keep the event loop alive for the remaining timeout.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
        // Explicitly uncached. Next 16 makes fetch caching opt-in, and these
        // responses are large enough that caching them matters — but the cache
        // is applied one layer up, over the small projected result, in the
        // courier client. Caching the raw megabytes here would spend the cache
        // budget on fields we throw away. See `nomenclature()` in econt.ts.
        cache: 'no-store',
      })

      if (!response.ok) {
        lastReason = `HTTP ${response.status}`

        if (isRetryable(response.status) && attempt < attempts) {
          await sleep(backoffMs(attempt))
          continue
        }

        return { ok: false, reason: lastReason }
      }

      return { ok: true, data: (await response.json()) as T }
    } catch (error) {
      // Covers the timeout abort, DNS and TLS failures, and a body that is not
      // JSON. All of them are worth one more try.
      lastReason =
        error instanceof Error && error.name === 'AbortError'
          ? `timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : 'unknown network error'

      if (attempt < attempts) {
        await sleep(backoffMs(attempt))
        continue
      }
    } finally {
      clearTimeout(timer)
    }
  }

  return { ok: false, reason: lastReason }
}
