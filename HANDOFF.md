# Handoff — resume point

_Last updated: 2026-08-06. Delete this file once the work is merged._

## Where things stand

Branch: **`phase-0-stabilise`** (branched from `main` at `20e53bf`).

Five chunks of work are complete and verified:

- **Phase 0** — stabilisation (all 11 items from `AUDIT.md` §6 Phase 0)
- **Phase 0.5** — the unblocked quality pass (accessibility, SEO, README)
- **Phase 0.6** — S-14, the server/client component split
- **Phase 0.7** — legal identity, the real contact form, structured data
- **Phase 1a** — commerce foundations: money, shipping, checkout form
  (**machinery only — every business number is still empty**)

All five are recorded in detail in `AUDIT.md`, in the "Phase 0 status" …
"Phase 1a status" sections near the top. **`AUDIT.md` is the source of
truth** — read it first.

Verified state at handoff:

```
npx tsc --noEmit          # clean
npm test                  # 240 passed / 240 (26 files)
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
3. **Nothing in Phase 1a is priced, and that is deliberate.** `src/data/pricing.ts`
   and the tariff table in `src/lib/shipping.ts` are empty. Every module returns
   an explicit `unconfigured` result rather than a zero, and the UI renders it —
   an unpriced product says "price on request", a missing rate card refuses to
   quote, card payment is hidden. Fill a table entry and it starts working; there
   is nothing to un-fake first. Tests assert the tables are empty, so they will
   fail the moment someone invents a number — change the test in the same commit
   as the real number.

## Starting a new session

1. Open the new session in this directory (`55candles`).
2. Confirm the branch: `git branch --show-current` → `phase-0-stabilise`
3. Tell the agent something like:

   > Read `AUDIT.md` and `HANDOFF.md`. Phases 0 through 1a are done. Continue
   > from `<the phase you want>`.

4. Re-run the four verification commands above before changing anything —
   `npm test` now takes a few minutes; the other three are quick. They confirm
   nothing drifted.

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
| 9 | **Q-11 + Q-12 prices and packed weights** — `src/data/pricing.ts` has all six slugs listed and commented out. Every product currently shows "price on request" and nothing can be bought. The **weight** is not optional: it is what selects a courier rate band, so a price without a weight still cannot check out. | Weigh one finished candle **in its shipping box** (grams), and set a price per scent. Then uncomment the six lines: `cherry: { price: eur(24.5), packedWeightGrams: 520 }`. Prices are authored in major units and stored as integer cents. |
| 10 | **Q-22 courier rate cards** — `tariffs` in `src/lib/shipping.ts` is empty, so every delivery option returns `unconfigured` and refuses to quote rather than shipping free. There are 6 keys to fill: econt/speedy × door/office/locker. | Get the signed rate card from each merchant contract and enter it as ascending weight bands with an open-ended last band (`upToGrams: null`). Also decide **Q-23: who pays the наложен платеж fee** — currently modelled as `COD_FEE_PAID_BY = 'merchant'`, i.e. absorbed, not added to the customer's total. |
| 11 | **Q-22 courier API credentials** — separate from the rate cards. Without them the office/locker picker is a free-text box, because a picker full of invented offices produces orders addressed to offices that do not exist. | Set `ECONT_USERNAME` / `ECONT_PASSWORD` and `SPEEDY_USERNAME` / `SPEEDY_PASSWORD` per `.env.example`, then implement the client in `src/lib/couriers/` against the interface already defined there. |
| 12 | **Q-20 Stripe account** — the card option is hidden at checkout while `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is unset, and the server action refuses `card` even if someone posts it directly. Only наложен платеж is offered today. | Open the Stripe account under „ВиреонЛабс“ ЕООД, set both keys plus `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and decide **Q-26: the statement descriptor** — what customers see on their bank statement. `55CANDLES` is more recognisable than the legal name; it must be set deliberately, so `STATEMENT_DESCRIPTOR` is `null` until you choose. |
| 13 | **Q-24 free-delivery threshold** — `FREE_DELIVERY_OVER` is `null`, so no order ever ships free. This is a margin decision, not a technical one. | Either give an amount in EUR, or confirm there is no threshold and leave it `null`. The quote logic already handles both and flags `free: true` when it applies. |

## What to do next

**Phase 1a built the commerce machinery; Phase 1b is where it starts taking
money, and that is blocked on business decisions.** Four decisions are already
made and encoded: **EUR only**, **Stripe + наложен платеж**, **all three
delivery methods** (door / office / locker), and **prices deferred on purpose**.

What Phase 1b still needs from you is blockers **9–13** above — the numbers.
Nothing in that list is development time; each one is a table entry.

Still unanswered and still blocking:

- **Q-34** hosting + database. This is now the largest technical gap: checkout
  validates, prices and totals an order, then stops with "no order storage yet"
  because there is nowhere to put it. No database, no orders.
- **Q-31** guest checkout or customer accounts
- **Q-14** euro/BGN dual display. Currently EUR only, per your decision. If dual
  display turns out to be required, the change is confined to `formatMoney` in
  `src/lib/money.ts` — never store a second amount.
- **Q-28** Наредба Н-18 / НАП — needs your accountant, gates Phase 7, outside
  your control. Start it now.

All 36 open questions are in `AUDIT.md` §5.

**Unblocked work still available**, if you want progress without decisions:

- Descriptive `alt` text for product images (N-10, still partial)
- A cart: the checkout accepts a cart of slugs and quantities, but nothing
  builds one yet — there is no "add to basket" and no cart persistence. This can
  be built and tested with the pricing table still empty.
- `Product` / `Offer` JSON-LD — `toMajorUnits()` in `src/lib/money.ts` exists to
  format the `Offer` price, but an `Offer` needs a price, so this waits on Q-11
- Wire `BreadcrumbJsonLd` into the product and listing pages (the checkout page
  already uses it; product and listing pages do not)

## Uncommitted?

If `git status` shows changes, nothing is lost — the work is on disk. Commit
it before doing anything else. `.claude/settings.local.json` is your own
local file and was deliberately left out of these commits.
