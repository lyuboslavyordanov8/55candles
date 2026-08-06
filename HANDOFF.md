# Handoff — resume point

_Last updated: 2026-08-06. Delete this file once the work is merged._

## Where things stand

Branch: **`phase-0-stabilise`** (branched from `main` at `20e53bf`).

Four chunks of work are complete and verified:

- **Phase 0** — stabilisation (all 11 items from `AUDIT.md` §6 Phase 0)
- **Phase 0.5** — the unblocked quality pass (accessibility, SEO, README)
- **Phase 0.6** — S-14, the server/client component split
- **Phase 0.7** — legal identity, the real contact form, structured data

All four are recorded in detail in `AUDIT.md`, in the "Phase 0 status" …
"Phase 0.7 status" sections near the top. **`AUDIT.md` is the source of
truth** — read it first.

Verified state at handoff:

```
npx tsc --noEmit          # clean
npm test                  # 145 passed / 145 (18 files)
npm run build             # succeeds (Next 16.3.0)
npm audit --omit=dev      # 0 vulnerabilities
```

The trading company is **„ВиреонЛабс“ ЕООД, ЕИК 208907603**, trading as
55candles. It lives in `src/lib/company.ts` — one place, used by the footer
impressum, the legal pages and the `Organization` JSON-LD.

Two things to know before changing code:

1. The client message catalogue is scoped to `CLIENT_NAMESPACES` in
   `src/i18n/client-namespaces.ts`. If you add `'use client'` to something that
   calls `useTranslations`, add its namespace there too. `npm test` catches it.
2. **The legal pages are unreviewed drafts.** `LEGAL_IS_DRAFT` in
   `src/lib/legal.ts` is `true`, so each page shows a warning banner, sends
   `noindex`, and stays out of `sitemap.xml`. Do not flip it before a Bulgarian
   lawyer has read them.

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
| 6 | **Legal review** — the six documents under `/[locale]/legal/` are drafts with 18 `[TODO: …]` markers rendered visibly on the page. They are not fit to publish. | A Bulgarian lawyer reads all six, the TODOs get real answers, then set `LEGAL_IS_DRAFT = false` in `src/lib/legal.ts`. A test fails if you clear the flag while any marker remains. |
| 7 | **Identity fields still missing** — `src/lib/company.ts` has 6 unresolved fields: ДДС number (or a confirmation you are not VAT-registered), street, city, postal code, управител, and a contact email on your own domain. | Fill them in `company.ts`; the footer impressum, legal pages and JSON-LD all update from that one file. The ДДС number is deliberately **not** derived from the ЕИК — VAT registration is a fact about the company, and it changes what your prices must include. |
| 8 | **`/api/contact` returns 503** — the endpoint is real and validated, but no email provider is wired, so every submission is refused with a visible "email isn't set up yet, please call" message and a loud server-side `console.error`. | Pick a provider (Resend, Postmark, SendGrid …), set `CONTACT_EMAIL_TO` and `EMAIL_PROVIDER_API_KEY` per `.env.example`, then implement `deliver()` in `src/lib/mailer.ts` (B-17). Until then the form works but cannot deliver. |

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

**The shortest path off the critical path** is blockers 6–8 above: they need
your input, not development time, and blocker 8 is the only reason a customer
who fills in the contact form today gets nothing.

**Unblocked work still available**, if you want progress without decisions:

- Descriptive `alt` text for product images (N-10, still partial)
- `Product` / `Offer` JSON-LD — the component in `src/components/seo/JsonLd.tsx`
  is ready to extend, but an `Offer` needs a price (B-03), so this waits on Q-11
- Wire `BreadcrumbJsonLd` into the product and listing pages (it is currently
  used only by the legal pages)

## Uncommitted?

If `git status` shows changes, nothing is lost — the work is on disk. Commit
it before doing anything else. `.claude/settings.local.json` is your own
local file and was deliberately left out of these commits.
