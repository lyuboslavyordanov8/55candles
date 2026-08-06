# Handoff — resume point

_Last updated: 2026-08-06. Delete this file once the work is merged._

## Where things stand

Branch: **`phase-0-stabilise`** (branched from `main` at `20e53bf`).

Three chunks of work are complete and verified:

- **Phase 0** — stabilisation (all 11 items from `AUDIT.md` §6 Phase 0)
- **Phase 0.5** — the unblocked quality pass (accessibility, SEO, README)
- **Phase 0.6** — S-14, the server/client component split

All three are recorded in detail in `AUDIT.md`, in the sections
"Phase 0 status", "Phase 0.5 status" and "Phase 0.6 status" near the top.
**`AUDIT.md` is the source of truth** — read it first.

Verified state at handoff:

```
npx tsc --noEmit          # clean
npm test                  # 73 passed / 73
npm run build             # succeeds (Next 16.3.0)
npm audit --omit=dev      # 0 vulnerabilities
```

One thing to know before touching a component: the client message catalogue is
now scoped to `CLIENT_NAMESPACES` in `src/i18n/client-namespaces.ts`. If you add
`'use client'` to something that calls `useTranslations`, add its namespace there
too. `npm test` catches it if you forget.

## Starting a new session

1. Open the new session in this directory (`55candles`).
2. Confirm the branch: `git branch --show-current` → `phase-0-stabilise`
3. Tell the agent something like:

   > Read `AUDIT.md` and `HANDOFF.md`. Phase 0 and 0.5 are done. Continue
   > from `<the phase you want>`.

4. Re-run the four verification commands above before changing anything —
   they take under a minute and confirm nothing drifted.

`AGENTS.md` matters: this is Next.js 16, which differs from most training
data. Read `node_modules/next/dist/docs/` before writing framework code.
Things already found the hard way: `middleware.ts` is now `proxy.ts`,
error boundaries take `unstable_retry` not `reset`, and `global-not-found.tsx`
needs `experimental.globalNotFound`.

## Blocked on you (not on the agent)

| # | Blocker | What to do |
|---|---|---|
| 1 | **GPG signing** — `commit.gpgsign=true`, and signing needs an interactive passphrase an agent cannot supply. This is why the work may still be uncommitted. | Run `echo test \| gpg --clearsign > /dev/null`, enter the passphrase once; `gpg-agent` then caches it. Or commit yourself. |
| 2 | **Q-06 domain** — `NEXT_PUBLIC_SITE_URL` is unset, so the site emits `noindex` and `robots.txt` disallows everything. | Decide the real domain. `55candles.bg` was only ever a throwaway test value, guessed from the Instagram handle — it is configured nowhere. |
| 3 | **Q-36 hover photos** — 5 products referenced `IMG_75xx_alt.webp`, which were never committed. Dead refs removed; the hover logic was deliberately kept, now in `src/components/products/ProductImagePair.tsx` and rendered only when a product has `hoverImagePath` — so it currently costs nothing. | Supply the `_alt.webp` files and re-add `hoverImagePath` in `src/data/products.ts`, or say they don't exist and `ProductImagePair` gets deleted. |
| 4 | **C-01 static rendering** — every route renders dynamically. Blocked upstream: the only lever is next-intl's `setRequestLocale`, which is deprecated in favour of `next/root-params`, and next-intl doesn't consume root-params yet. | Choose: wait for upstream, knowingly use the deprecated API, or stay dynamic. Not urgent. |
| 5 | **Contrast changed the design** — three colour tokens were darkened to pass WCAG AA. The exact before/after ratios are in `AUDIT.md`. | Confirm you accept the darker text, or ask for a different approach. |

## What to do next

**Phase 1 (commerce foundations) is the big one, and it is blocked on
business decisions.** Before it can start, answer at minimum:

- **Q-34** hosting + database
- **Q-31** guest checkout or customer accounts
- **Q-11 / Q-12** price and weight per product (weight gates all courier pricing)
- **Q-14** euro/BGN dual display — verify the current rule

All 36 open questions are in `AUDIT.md` §5. The two with the longest external
lead times are **Q-22** (Speedy/Econt merchant contracts) and **Q-28**
(Наредба Н-18 — needs your accountant). Start those now; they gate Phases 4
and 7 and are outside your control.

**Unblocked work still available**, if you want progress without decisions:

- Organization / BreadcrumbList JSON-LD (`Product`/`Offer` needs prices first — S-12)
- Legal page scaffolding with `[TODO]` placeholders (§6 Phase 5)
- Descriptive `alt` text for product images (N-10, still partial)

## Uncommitted?

If `git status` shows changes, nothing is lost — the work is on disk. Commit
it before doing anything else. `.claude/settings.local.json` is your own
local file and was deliberately left out of these commits.
