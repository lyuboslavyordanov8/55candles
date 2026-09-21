/**
 * Adds `Vary: Accept-Language` to a redirect response (SEO audit finding:
 * `curl -D- /` returned a 307 with no `Vary` header at all, so a CDN caching
 * it by URL alone could serve one visitor's negotiated locale to everyone
 * after).
 *
 * Only on a redirect (3xx) — a request that already names its locale in the
 * path (`/bg/...`) renders the same response regardless of Accept-Language,
 * so tagging every response would just make a CDN treat two identical pages
 * as different cache entries for no reason. It is only the locale-less `/`
 * that actually varies by this header.
 *
 * Lives in its own module, separate from `src/proxy.ts`, purely so it can be
 * imported without pulling in `next-intl/middleware`: Vitest's SSR-
 * externalised dependency resolution cannot load that module at all in this
 * repo (a pre-existing extensionless `next/server` import inside its
 * compiled output that doesn't match Next 16's package exports, unrelated to
 * this change) — see `src/__tests__/proxy.test.ts`.
 */
export function addVaryOnRedirect<T extends Response>(response: T): T {
  if (response.status >= 300 && response.status < 400) {
    response.headers.append('Vary', 'Accept-Language')
  }
  return response
}
