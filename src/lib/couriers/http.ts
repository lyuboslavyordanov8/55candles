import 'server-only'

/**
 * The one HTTP call every courier client makes (AUDIT.md B-13 step 8).
 *
 * Econt and Speedy are `POST`-only with a JSON body, which is `postJson`. Pigeon
 * Express is REST — `GET` with a query for lookups, API keys in headers — which
 * is `requestJson`, the same call with the method and headers opened up. It
 * lives here rather than in each client so the failure policy is written once:
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

export interface RequestJsonOptions extends Omit<PostJsonOptions, 'body'> {
  method: 'GET' | 'POST'
  /** Appended as a query string. `undefined` values are left out. */
  query?: Record<string, string | number | undefined>
  /** Sent as JSON. Not allowed on a `GET`. */
  body?: unknown
  /** Extra request headers — Pigeon's `X-API-Key` / `X-API-Secret`. */
  headers?: Record<string, string>
}

const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_ATTEMPTS = 3
const BASE_BACKOFF_MS = 200

/**
 * Econt reports *application* errors as HTTP 517 with an `ExInvalidParam` body —
 * an unknown office code, a city it cannot match, a wrong password. Verified
 * 2026-09-20 against the live service.
 *
 * It is in the 5xx range and is nevertheless permanent, so retrying it triples
 * the latency of an error the customer is already waiting on and sends the same
 * rejected request twice more.
 */
const APPLICATION_ERROR_STATUS = 517

/** Status codes where the same request might succeed if sent again. */
function isRetryable(status: number): boolean {
  if (status === APPLICATION_ERROR_STATUS) return false

  return status === 429 || status >= 500
}

/** How much of an error body goes into the reason. Enough to name the cause. */
const REASON_BODY_MAX = 300

/**
 * `HTTP 517` on its own is unactionable — every courier rejection looks
 * identical in the log. The body says which field it objected to, so a short
 * prefix of it travels with the status.
 *
 * Errors are swallowed: we are already on the failure path, and a body that
 * cannot be read must not replace a useful status with an exception.
 */
async function describe(response: Response): Promise<string> {
  try {
    const body = (await response.text()).replace(/\s+/g, ' ').trim()

    return body ? `HTTP ${response.status}: ${body.slice(0, REASON_BODY_MAX)}` : `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
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

export function postJson<T>(options: PostJsonOptions): Promise<HttpResult<T>> {
  return requestJson<T>({ ...options, method: 'POST' })
}

function withQuery(url: string, query: RequestJsonOptions['query']): string {
  if (!query) return url

  const params = new URLSearchParams()

  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) params.set(name, String(value))
  }

  const encoded = params.toString()

  return encoded ? `${url}${url.includes('?') ? '&' : '?'}${encoded}` : url
}

export async function requestJson<T>({
  method,
  url,
  query,
  body,
  auth,
  headers: extraHeaders,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  attempts = DEFAULT_ATTEMPTS,
}: RequestJsonOptions): Promise<HttpResult<T>> {
  const headers: Record<string, string> = {
    ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    Accept: 'application/json',
    ...extraHeaders,
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
      const response = await fetch(withQuery(url, query), {
        method,
        headers,
        ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
        signal: controller.signal,
        // Explicitly uncached. Next 16 makes fetch caching opt-in, and these
        // responses are large enough that caching them matters — but the cache
        // is applied one layer up, over the small projected result, in the
        // courier client. Caching the raw megabytes here would spend the cache
        // budget on fields we throw away. See `nomenclature()` in econt.ts.
        cache: 'no-store',
      })

      if (!response.ok) {
        lastReason = await describe(response)

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
