# 55candles

Bilingual (BG/EN) storefront for a Bulgarian candle maker.

> **Status: pre-launch marketing site, not yet an e-commerce application.**
> There is no cart, checkout, order, payment or shipping integration. See
> [`AUDIT.md`](./AUDIT.md) for the full gap analysis, the launch blockers and
> the phased plan to close them.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript, `strict` |
| Styling | Tailwind CSS v4 (tokens in `tailwind.config.ts`) |
| i18n | `next-intl` — `en` and `bg` |
| Animation | `framer-motion` |
| Tests | Vitest + Testing Library + jsdom |

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000 -> redirects to /en or /bg
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Watch mode |
| `npx tsc --noEmit` | Typecheck |

## Environment

No secrets are required yet. One optional variable:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Production | Canonical origin for `metadataBase`, `sitemap.xml`, `robots.txt` and OG tags. |

**If it is unset, the site marks itself `noindex` and `robots.txt` disallows
everything.** That is deliberate — it keeps previews and local builds out of
search results. Set it to the real origin (e.g. `https://example.com`, no
trailing slash) before launch.

## Architecture notes

### Routing and locales

Every route lives under `src/app/[locale]/`. **There is no root
`src/app/layout.tsx`** — the root layout sits under the dynamic `[locale]`
segment. Two consequences worth knowing:

- Unmatched URLs have no layout to render into, so 404s are served by
  `src/app/global-not-found.tsx` (enabled via `experimental.globalNotFound`).
- `[locale]` is a catch-all single segment, so it also matches junk like
  `/robots.txt` or `/foo.bar` — anything `src/proxy.ts` skips because it
  contains a dot. `src/app/[locale]/layout.tsx` validates the locale and
  calls `notFound()`; **removing that guard makes every such URL render the
  homepage with a 200**.

`src/proxy.ts` is the Next 16 rename of `middleware.ts`. Locales are defined
once in `src/i18n/locales.ts` — import from there rather than re-declaring
the list.

### Error and 404 boundaries

| File | Handles |
|---|---|
| `src/app/[locale]/not-found.tsx` | `notFound()` called inside a locale route |
| `src/app/[locale]/error.tsx` | Runtime errors within a locale route |
| `src/app/global-not-found.tsx` | URLs matching no route at all |
| `src/app/global-error.tsx` | Errors thrown by the root layout itself |

The two global files bypass all layouts, so they ship their own `<html>`,
styles and fonts. Next 16 passes `unstable_retry` (not `reset`) to error
boundaries.

### Content

Products are a hardcoded array in `src/data/products.ts` with **no price, no
stock and no weight** — moving them into a database is Phase 1 of the audit
plan. Product copy is currently English-only in both locales.

UI strings live in `messages/{en,bg}.json`.

### Design tokens

Colours and fonts are defined in `tailwind.config.ts`. The text tokens are
tuned to clear **WCAG AA (4.5:1)** against every cream background, and
`src/__tests__/contrast.test.ts` fails the build if that regresses. Do not
lighten `ink-ghost`, `ink-secondary` or `clay` without re-running it.

Motion respects `prefers-reduced-motion` in two places, both needed: a CSS
block in `src/app/globals.css` for transitions, and `<MotionConfig
reducedMotion="user">` for framer-motion, which animates via inline styles.

## Testing

```bash
npm test
```

The jsdom environment lacks `IntersectionObserver`, `ResizeObserver` and
`matchMedia`, all of which framer-motion uses. `src/test/setup.ts` stubs
them; without it every scroll-animated component throws at render.

Client pages are split into a server `page.tsx` (which owns
`generateMetadata`) and a `*Content.tsx` Client Component. **Tests import the
`*Content` component**, not the page.

## CI

`.github/workflows/ci.yml` runs on every push and PR: typecheck → test →
build → `npm audit --omit=dev`.

The audit gate covers production dependencies only. One low-severity dev-only
advisory is knowingly tolerated (esbuild dev-server file read on Windows);
no fix survives vitest's pinned vite range, and that server is never run.

## Security

Headers are set in `next.config.ts`: CSP, HSTS, `X-Content-Type-Options`,
`Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy`.

The CSP is the **static** form and includes `'unsafe-inline'`. This is a
deliberate trade: the stricter nonce-based CSP requires dynamic rendering on
every request. `'unsafe-inline'` is needed by Next's inline bootstrap scripts
and by framer-motion's inline styles.

Adding Stripe will require CSP and `Permissions-Policy` changes — both are
marked with `TODO` comments in `next.config.ts`.
