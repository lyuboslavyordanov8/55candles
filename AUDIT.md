# 55candles — Pre-launch Audit

**Audit date:** 2026-08-06
**Commit audited:** `20e53bf` (branch `main`)
**Scope:** full pre-launch review — commerce, payments, shipping, legal, GDPR, security, email, tax, frontend/SEO, ops.
**Method:** static read of the repository, plus `npx vitest run`, `npx tsc --noEmit`, `npm audit --omit=dev`. No files
were modified other than this document.

---

## 1. Executive summary

**Verdict: not launch-ready. This is a marketing brochure site, not an e-commerce application.**

There is no cart, no checkout, no order, no customer, no database, no API route, no payment, no shipping and no legal
page anywhere in the codebase. Products are a hard-coded TypeScript array with no price, no stock and no weight (
`src/data/products.ts:3-218`). The only "buy" affordance is a permanently disabled button (
`src/app/[locale]/products/[slug]/page.tsx:101-106`). The contact form is a 1-second `setTimeout` that discards the
message and tells the customer it was sent (`src/app/[locale]/contact/page.tsx:27-39`). Five product images referenced
in data do not exist on disk, producing 404s on every card render. The test suite is red: 18 of 42 tests fail and `tsc`
reports 2 errors.

Top blockers, in order: (1) no persistence layer or order model to build anything on; (2) no pricing or currency
decision — relevant given Bulgaria's 2026 euro adoption; (3) Stripe entirely absent; (4) Speedy/Econt and наложен платеж
entirely absent; (5) zero legal pages and no trader identification, which is a compliance exposure from day one of
selling.

Realistically this is a **greenfield commerce build on top of an existing front end**, not a gap-fill. The front end
itself is decent and reusable.

---

## Phase 0 status — COMPLETE (branch `phase-0-stabilise`)

Stabilisation work from §6 Phase 0 is done and verified. `tsc --noEmit` clean, **42/42 tests pass** (was 18 failing),
`next build` succeeds, **0 production-dependency vulnerabilities**.

| Item | Status | Note |
|---|---|---|
| S-01 IntersectionObserver in tests | Done | Also stubbed `ResizeObserver` and `matchMedia` |
| S-02 stale price assertion | Done | Now asserts `toBeUndefined`; invert when pricing lands |
| S-03 TS2554 errors | Done | Both pages are client components taking no props |
| S-04 `notFound` mock | Done | Mock now throws, as the real one does |
| B-19 broken hover images | Done | Data refs removed; component logic kept — see Q-36 |
| S-13 image `priority` | Done | Now opt-in, first row only |
| N-01…N-04 dead code | Done | `ScentsStrip`, `GlowingCursor`, `react-parallax-tilt`, 5 orphaned JPEGs |
| B-23 404 / error pages | Done | `[locale]/not-found`, `[locale]/error`, `global-not-found`, `global-error` |
| B-21 security headers + CSP | Done | Verified on the wire; `X-Powered-By` removed |
| S-05 dependency vulnerabilities | Done | `next@16.3.0`, `vitest@3.2.7`, vite override; 1 residual dev-only low |
| S-15 CI | Done | `.github/workflows/ci.yml` — typecheck, test, build, prod audit gate |

## Phase 0.5 status — quality pass (unblocked items only)

Follow-on work that needed no business decisions. `tsc` clean, **68/68 tests pass** (up from 42), build green,
0 production-dependency vulnerabilities.

| Item | Status | Note |
|---|---|---|
| S-07 mobile menu a11y | Done | Real `role="dialog"`, focus trap, Escape, scroll lock, focus restore; 8 tests |
| S-08 contrast | Done | Three tokens failed, not two — `clay` was 3.76:1 on cream-muted. See below |
| N-09 reduced motion | Done | CSS block **and** `MotionConfig reducedMotion="user"`; framer-motion animates inline so CSS alone misses it |
| S-09 sitemap + robots | Done | `sitemap.ts` with `alternates.languages` hreflang, `robots.ts` |
| S-10/S-11 metadata | Done | `metadataBase`, title template, canonical, hreflang, OG/Twitter, per-page titles |
| S-16 README | Done | Replaced `create-next-app` boilerplate with a real runbook |
| C-01 static rendering | **Not done** | Blocked upstream — see below |
| S-06 form labels | Done | Landed in Phase 0 |
| N-10 alt text | Partial | Hover image now `alt=""` + `aria-hidden` (decorative); descriptive alt still open |

**Contrast — this changes the look.** The locked design tokens failed WCAG AA against the cream backgrounds,
`cream-muted` being the binding case. Hue and saturation are unchanged; only HSL lightness moved. The text is
visibly darker than the original design intent — if you want to push back, these are the numbers:

| Token | Was | Now | Was (base/surface/muted) | Now |
|---|---|---|---|---|
| `ink-ghost` | `#9B8E82` | `#71655A` | 2.84 / 2.99 / **2.56** | 5.04 / 5.30 / 4.54 |
| `ink-secondary` | `#7A7065` | `#5B534B` | 4.32 / 4.54 / **3.89** | 6.72 / 7.06 / 6.05 |
| `clay` | `#8B6F4E` | `#7C6346` | 4.17 / 4.39 / **3.76** | 5.01 / 5.27 / 4.52 |

`src/__tests__/contrast.test.ts` now fails the build if these regress. All three are used at body size or smaller,
so the 4.5:1 threshold applies and the 3:1 large-text allowance does not.

**C-01 is blocked upstream, not skipped.** next-intl 4.9 resolves the locale via
`getCachedRequestLocale() || getLocaleFromHeader()`; the header read is what forces dynamic rendering. The only
lever is `setRequestLocale`, which next-intl **deprecates** in favour of `next/root-params` — and next-intl does not
consume root-params yet. Options: (a) wait for next-intl to adopt it, (b) knowingly use the deprecated API to buy
static rendering now, (c) leave the site dynamic. **Owner decision.** Not urgent: much of the site becomes dynamic
once a cart exists anyway.

**Also worth knowing:** `NEXT_PUBLIC_SITE_URL` is now required in production. While it is unset the site emits
`noindex` and `robots.txt` disallows everything — deliberate, so previews cannot be indexed. Set it before launch
(gated on Q-06).

## Phase 0.6 status — S-14 server/client split (COMPLETE)

`tsc` clean, **73/73 tests pass** (up from 68), build green, 0 production-dependency vulnerabilities.

Almost every `'use client'` in the codebase existed for one of three reasons — an entrance animation, a hover lift,
or scroll-dependent styling. None of them need the *content* on the client, so three mechanisms replaced all of them:

| Mechanism | Replaces | Where |
|---|---|---|
| `<Reveal>` — one client wrapper that animates server-rendered `children` | `motion.*` wrappers around static markup | `src/components/motion/Reveal.tsx` |
| CSS `hover:-translate-y-1` | `whileHover={{ y: -4 }}` on the product card | `src/components/products/ProductCard.tsx` |
| `data-transparent` on `<header>` + Tailwind `group-data-[transparent=true]:*` | scroll state passed down as computed class names | `src/components/layout/NavbarShell.tsx` |

| Item | Status | Note |
|---|---|---|
| `Navbar`, `Footer`, `ProductCard`, `Hero`, `ScentGrid`, `BrandValues`, `Testimonials`, `CtaBanner`, `StoryTeaser`, `CandleCareTeaser` | Server Components | `'use client'` removed |
| `our-story`, `candle-care` pages | Server Components | `OurStoryContent` / `CandleCareContent` deleted — they existed only to hold animations |
| Scoped message catalogue | Done | `src/i18n/client-namespaces.ts`; layout passes `pickClientMessages(await getMessages())` |
| Still client, legitimately | — | contact form (state), `MobileMenu` (open state, focus trap), `LanguageSwitcher` (`usePathname`), `ProductImagePair` (`onLoad`), `Reveal`, `MotionProvider` |

Measured, on a production build:

| | Before | After | |
|---|---|---|---|
| Client JS | 844,135 B | 817,595 B | −26 KB |
| `.next/static/chunks` | 879 K | 855 K | −24 K |
| Message catalogue per page | 4,426 B | 634 B | **−86 %** |

`CLIENT_NAMESPACES` is `['contact', 'notFound', 'error']`. `nav` is deliberately absent: `MobileMenu` is a Client
Component but receives its labels already translated, as props from the server-rendered `Navbar`. **Making a
component a Client Component now requires adding its namespace to that list**, or `useTranslations` throws
`MISSING_MESSAGE` in the browser, on a route nobody may have opened yet.
`src/i18n/__tests__/client-namespaces.test.ts` scans the source for exactly that mistake (5 tests).

Verified on the wire, not just in the build output: `/en/products` no longer carries homepage copy at all; homepage
strings appear exactly once, as rendered HTML rather than duplicated in an embedded JSON catalogue;
`data-transparent="true"` on `/en` and `"false"` on `/en/products`; Tailwind did generate the four
`group-data-[transparent=true]:*` rules; and the 404 page still renders from the narrowed catalogue with no
`MISSING_MESSAGE`. The reduced-motion guarantee for the card lift now comes from the `globals.css`
`transition-duration: .01ms !important` block instead of `MotionConfig` — confirmed present in the built CSS.

**C-01 is still not done.** It was folded into S-14 in the original plan, but it is blocked upstream for reasons
unrelated to the split (see above) — the split neither helps nor hurts it.

## Phase 0.7 status — legal identity, contact form, structured data (COMPLETE)

`tsc` clean, **145/145 tests pass across 18 files** (up from 73/13), build green, 0 production-dependency vulnerabilities.

The owner supplied the trading company on 2026-08-06: **„ВиреонЛабс“ ЕООД, ЕИК 208907603**, trading as 55candles.
That unblocked the identity layer, which is what the rest of this phase is built on.

| Item | Status | Note |
|---|---|---|
| B-16 trader identification | Done | `src/lib/company.ts` is the single source; `Impressum` renders it in the footer site-wide and in full on every legal page |
| B-15 legal pages | **Scaffolded, not reviewed** | Six documents, both locales, at `/[locale]/legal/[slug]`. See the warning below |
| B-20 fake contact form | Done | Real endpoint; the form can no longer claim success it did not achieve |
| S-12 structured data | Partial | `Organization` + `BreadcrumbList`. `Product`/`Offer` still gated on prices (B-03) |
| B-17 transactional email | Foundation only | `src/lib/mailer.ts` defines the contract and returns `unconfigured`; no provider chosen |
| N-12 `.env.example` | Done | Documents what is required now and what each later phase will add |

**The legal pages are drafts and are not safe to rely on.** `LEGAL_IS_DRAFT` in `src/lib/legal.ts` is `true`, which
makes every page render a visible warning banner and send `noindex`, and keeps them out of `sitemap.xml`. They are
**not** reviewed by a Bulgarian lawyer, and roughly 20 `[TODO: …]` markers remain — each one a decision only the owner
or their lawyer can make (return shipping costs, delivery charges and times, payment methods, retention periods,
processor list). The markers render visibly on the page rather than as blank space, so an unfinished document cannot
ship looking finished. Flip the flag only after legal review; `src/__tests__/legal.test.ts` then fails if any `[TODO`
remains.

**B-20 was the most customer-hostile bug in the audit, and the fix is deliberately a visible failure.** The form used
to await a 1000 ms timeout and then unconditionally display "Message sent!", destroying every enquiry including order
enquiries. It now posts to `/api/contact`, which validates, rate-limits (in-process, best-effort), and absorbs bots via
a honeypot. Because no email provider is configured yet (B-17), a valid submission returns **503** and the form tells
the customer the email is not set up and to phone or DM instead. That is the point: a form that visibly fails loses
one enquiry, a form that lies loses every enquiry and nobody finds out. Set `CONTACT_EMAIL_TO` and
`EMAIL_PROVIDER_API_KEY` and implement `deliver()` in `src/lib/mailer.ts` to complete it.

**The ДДС number is deliberately not derived from the ЕИК.** A Bulgarian VAT number is formatted `BG` + ЕИК, but only
once the company is actually VAT-registered — that is a fact about the company, not a string transformation, and it
determines what the prices on this site must include. `company.vatNumber` is a `[TODO]` and `isVatRegistered` is
`null` until the owner confirms. A test asserts the value is never `BG208907603`, so it cannot be filled in by guess.

Legal document slugs are **not** translated (`/bg/legal/terms`, not `/bg/legal/obshti-usloviya`). The URL is an
identifier; translating it would put the two language versions of one document at unrelated paths and break the
hreflang pairing that `sitemap.ts` and every page's `alternates.languages` depend on.

## Phase 1a status — commerce foundations: money, shipping, checkout form (SCAFFOLDED)

`tsc` clean, **240/240 tests pass across 26 files** (up from 145/18), build green, 0 production-dependency
vulnerabilities. The owner asked to start prices, payment integration and the Econt/Speedy delivery form, and
confirmed on 2026-08-06: **Stripe for cards plus наложен платеж**, **all three delivery methods** (door, office,
locker), **EUR-only display**, and that **prices and weights are not available yet**. The payment half of that was
**reversed on 2026-09-20 — no cards, наложен платеж only**; the card path has since been removed from the code, the
database and this document.

This phase builds the *machinery* and leaves every business number empty. That split is the whole point: the arithmetic,
validation and failure handling are testable now, and each unknown is one table entry away from working. Nothing is
guessed.

| Item | Status | Note |
|---|---|---|
| B-12 money model | Done | `src/lib/money.ts` — integer minor units, currency-checked arithmetic, `Intl` formatting |
| B-03 prices | **Machinery only — table empty** | `src/data/pricing.ts`. Price *and* packed weight per slug; a test fails if either is invented |
| Q-25 delivery methods | Done; rates are placeholders | `src/lib/shipping.ts` — 2 couriers × 3 methods, weight-banded tariffs. All 6 cards now carry `PLACEHOLDER_BANDS` so the flow is walkable; the real cards are still owed (Q-22) |
| Q-21 payment methods | **Settled: наложен платеж only** | `src/lib/payments.ts`. Decided 2026-09-20; the card path has been removed rather than left dormant |
| Q-22 couriers at launch | **Settled: Еконт only, Спиди "очаквайте скоро"** | `BOOKABLE_COURIERS` in `src/lib/shipping.ts`. Decided 2026-09-20. Speedy keeps its place in the type, the enum and the tariff table; the checkout greys it out and `validateDelivery` returns `courier: 'unavailable'`, so a hand-built POST cannot store an order nobody can label. One flag flips it back when the contract exists |
| Delivery form | Done | `/[locale]/checkout` + `DeliveryForm`. Fields switch on method; `useActionState` per the Next 16 forms guide |
| Order totals | Done | `src/lib/order-total.ts` — re-priced server-side, shipping and COD fee as separate line items |
| Courier office lookup | **Interface only** | `src/lib/couriers/` returns `unconfigured` until credentials exist (Q-22) |
| Q-20 card payments | **Closed by decision — not happening** | No provider, no keys, no webhook, no `paid` status. Reversing it is new work, not configuration |

**Money is never a float.** `0.1 + 0.2` is `0.30000000000000004`, and a shop that sums prices as floats eventually
charges a cent too much or issues a фактура that will not reconcile. Every amount is integer cents, arithmetic refuses
to mix currencies, and `multiplyMoney` takes only whole quantities — multiplying money by a fraction is a discount or a
tax split, with its own rounding policy, and conflating the two is how drift enters a ledger.

**An unset courier tariff quotes `unconfigured`, never zero.** The same principle as B-20: a missing rate card that
returned 0.00 would ship every parcel free and look like it was working. `quote()` returns a discriminated result the
UI has to render, and the checkout distinguishes "this product has no price" from "we cannot price delivery to there".

**The cart carries slugs and quantities only.** Prices are re-read from the catalogue inside the server action, because
a browser that can name its own total can name zero. A test submits a forged cart with `price: 1` and a `totalMinor=1`
field and asserts the computed total is unchanged. Per the Next 16 Server Actions guide, the action is a POST endpoint
reachable by anyone, so validation runs there regardless of what the form already checked.

**Наложен платеж is the only payment method** (decided 2026-09-20), so the checkout *states* how the customer will pay
instead of asking. There is no payment provider to configure, no card option to hide and no `paid` state that can
disagree with the bank. It is not obligation-free, though: the courier holds the money until it remits, so a delivered
order is not a settled one (B-14), and НАП receipt rules for courier-collected cash are still
`[VERIFY WITH ACCOUNTANT]` (Q-28).

**`Product.price` was removed from the type.** It was optional and unused; leaving it beside `pricing.ts` would have
been two competing sources of price that win or lose depending on which the caller reads.

**What is still missing, and from whom:** price and packed weight per product (Q-11/Q-12, owner — the price landed in
Phase 1b, the weight has not); Econt and Speedy rate cards and API credentials (Q-22, merchant contracts);
free-delivery threshold (Q-24); who bears the COD fee (Q-23 — currently modelled as the merchant, the safer default).
Card payments are no longer on the list: Q-20 is closed, there will be none. Order storage has since landed (Q-34/B-01): checkout writes the order and returns its
number. The checkout page stays `noindex` while the rates are placeholders, the legal pages are drafts and nothing can
email a confirmation.

## Phase 1b status (partial) — the flow is walkable, on one real number and two placeholders

`tsc` clean, **278/278 tests pass across 29 files** (up from 240/26), build green. The owner asked on 2026-08-06 to
**set every candle to 19,99 EUR in order to test the order flow**. A price alone does not make the flow walkable — three separate things blocked a completed order — so
all three were supplied, with the invented ones labelled as such in code, in the UI and here.

| What | Source | Flag |
|---|---|---|
| **Price: 19,99 € for all six scents** | The owner's figure. Real. | `UNIFORM_PRICE` in `src/data/pricing.ts` |
| Packed weight: **500 g** | **Invented.** No candle has been weighed in its box. | `PRICING_IS_PROVISIONAL = true`; `provisionallyWeighedSlugs()` lists which slugs still carry the guess |
| Courier rate bands: 4,99 / 5,99 / 7,99 / 11,99 € | **Invented** — roughly the shape of Bulgarian list pricing, not anyone's contracted card, and the same card is reused across door/office/locker | `TARIFFS_ARE_PLACEHOLDER = true` in `src/lib/shipping.ts` |

**Either flag being `true` renders a notice on the checkout page** telling the customer the delivery cost shown is
illustrative and not what would be charged — the same mechanism as `LEGAL_IS_DRAFT` on the legal pages. Tests assert
each flag matches the data behind it, so a stale flag fails the build rather than quietly shipping a guess as a fact.

Weight is not cosmetic: it is what selects the rate band, so a wrong weight is money lost on every parcel dispatched.
That is why it is flagged as loudly as the tariffs, despite looking like a detail beside the price.

Two supporting pieces landed with it:

- **`src/lib/cart-params.ts` — a URL-based basket** (`?items=cherry:2,vanilla:1`), the stopgap that makes the flow
  testable with no database or session store (B-05 remains open). It is entirely untrusted, which is safe because it
  carries **only slugs and quantities** — never a price — and the server action re-prices from the catalogue. Unknown
  slugs are dropped, quantities clamped (`MAX_QUANTITY_PER_LINE = 20`, `MAX_LINES = 10`). **When the real cart lands
  this module should be deleted, not extended.**
- **B-06 is no longer a dead button.** A purchasable product now links to `/{locale}/checkout?items={slug}:1`;
  `winter-wonderland` still shows a disabled control, because `isPurchasable()` checks season independently of price.

**The checkout page deliberately shows no total until a delivery method is chosen.** A goods-only "total" that grows at
the next step is precisely the pattern consumer law exists to prevent; the priced breakdown (goods, delivery, COD fee
where applicable, total, parcel weight) appears once the action can compute it, as separate lines.

`OrderSummary` is its own component rather than a block inside `DeliveryForm` because the form's summary only exists
after a Server Action round trip, which jsdom cannot perform — the breakdown was untestable until it was extracted.

Where the flow stopped when this was written: **`readyToPay`, then nothing.** That is no longer the end — the action now
writes the order, its lines and its first status event, and answers with an order number (see "Order storage" below).
`readyToPay` survives for the one case that still deserves it: no `DATABASE_URL`, where the customer is told plainly that
nothing was placed and no payment was taken.

### Order storage (B-01, B-09, Q-34) — done

A valid submission is persisted before anything else happens, because an order without a payment can be chased while a
payment without an order is money received against nothing. Three pieces:

- **`src/lib/orders.ts`** — the only writer. One batched transaction inserts the order, its snapshotted lines and the
  `order_events` row recording the status it was created in, always `awaiting_cod`. There is no `paid` status to reach:
  the courier collects the cash and the remittance is reconciled afterwards (B-14).
- **Idempotency** — the checkout page mints an intent token per render, the form replays it, and the unique index on
  `orders.intent_token` makes the second insert lose. The loser reads the winner and returns it, so a double-click, a
  refresh or two racing requests all answer with one order number. Verified against the live database, including the
  concurrent case.
- **Order numbers** — `55C-2026-000123`, from a Postgres sequence (`nextval` is atomic, gaps are acceptable for a
  human reference). Separate from the primary key, and not to be confused with an invoice series under Наредба Н-18.

What is still missing after it: no payment step (Q-20), no confirmation email (B-17) and no confirmation page, so the
number shown on the form is the customer's only record — which is why the checkout page keeps its "not live" notice and
stays `noindex`.

### Corrections to this audit

- **C-01 — the site is not statically rendered.** I described `/[locale]/products/[slug]` as "SSG via
  `generateStaticParams`". The build output marks **every** locale route `ƒ (Dynamic)`. `generateStaticParams` is
  declared, but next-intl's request config opts the tree into dynamic rendering unless `setRequestLocale` is called
  per page. Static rendering is therefore still **not** achieved — it was folded into S-14, but S-14 has since landed
  and C-01 has not: the blocker is upstream in next-intl, not in the component split.

### New finding, discovered during Phase 0 and fixed

- **B-24 — soft 404s served the homepage with HTTP 200.** `[locale]` is a catch-all single segment and the proxy
  matcher excludes any path containing a dot (`src/proxy.ts:9`), so `/robots.txt`, `/sitemap.xml`, `/foo.bar` and
  friends matched `[locale]` with a junk locale. `src/i18n/request.ts` silently fell back to `en`, so all of them
  **returned 200 with the full homepage HTML** — crawlers asking for `robots.txt` got a web page. Fixed by validating
  the locale in `src/app/[locale]/layout.tsx` and calling `notFound()`; all such paths now return 404 with
  `noindex`. Locale definitions were also deduplicated into `src/i18n/locales.ts` (they had been copied in three
  places). This was pre-existing and unrelated to the Phase 0 changes.

---

## Scope & inventory (Phase 0 result)

### Stack

| Area                     | Finding                                                                                                                 | Evidence                                                                                                    |
|--------------------------|-------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| Framework                | Next.js **16.2.2**, App Router, React 19.2.4                                                                            | `package.json:12-15`                                                                                        |
| Language                 | TypeScript 5, `strict: true`                                                                                            | `tsconfig.json:11`                                                                                          |
| Package manager          | npm (`package-lock.json` present, lockfileVersion 3)                                                                    | `package-lock.json`                                                                                         |
| Styling                  | Tailwind CSS v4 via `@tailwindcss/postcss`, with a legacy `tailwind.config.ts` pulled in by `@config`                   | `postcss.config.mjs:3`, `src/app/globals.css:1-2`, `tailwind.config.ts:1-39`                                |
| i18n                     | `next-intl` 4.8.4, locales `en` + `bg`, default `en`                                                                    | `src/proxy.ts:3-6`, `src/i18n/request.ts:3-16`                                                              |
| Routing middleware       | `src/proxy.ts` — correctly uses the Next 16 `proxy` convention (renamed from `middleware`)                              | `src/proxy.ts:1-10`; cf. `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` |
| Animation                | `framer-motion` 12 (used widely, client-side)                                                                           | `package.json:11`                                                                                           |
| Tests                    | Vitest 3 + Testing Library + jsdom                                                                                      | `vitest.config.ts:1-16`                                                                                     |
| **Database / ORM**       | **None.** No Prisma, Drizzle, Postgres, Mongo, SQLite, Supabase                                                         | `package.json:11-18`                                                                                        |
| **Auth**                 | **None.** No NextAuth/Auth.js/Clerk/Lucia, no session, no user                                                          | `package.json:11-18`                                                                                        |
| **CMS / commerce layer** | **None.** No Sanity, Contentful, Shopify, Medusa, Saleor, Payload                                                       | `package.json:11-18`                                                                                        |
| **Payments**             | **None.** No `stripe`, no `@stripe/*`                                                                                   | `package.json:11-18`                                                                                        |
| **Env vars**             | **Zero.** No `.env*` file exists; `process.env` is referenced nowhere in `src/`, `next.config.ts` or `vitest.config.ts` | verified by grep                                                                                            |
| **API routes**           | **Zero.** `src/app/api/` does not exist; no `route.ts` anywhere                                                         | verified                                                                                                    |
| Hosting target           | Unspecified. No `vercel.json`, no `Dockerfile`, no `.nvmrc`, no CI. README is untouched `create-next-app` boilerplate   | `README.md:1-3`                                                                                             |

### Route map

All routes live under `src/app/[locale]/`. There is **no root `src/app/layout.tsx`** — the root layout sits under a
dynamic segment.

| Route                       | File                                            | Type                                    |
|-----------------------------|-------------------------------------------------|-----------------------------------------|
| `/[locale]`                 | `src/app/[locale]/page.tsx:9`                   | Server page composing 7 client sections |
| `/[locale]/products`        | `src/app/[locale]/products/page.tsx:42`         | Static list from `products` array       |
| `/[locale]/products/[slug]` | `src/app/[locale]/products/[slug]/page.tsx:132` | Dynamic despite params — see C-01       |
| `/[locale]/our-story`       | `src/app/[locale]/our-story/page.tsx`           | `'use client'`                          |
| `/[locale]/candle-care`     | `src/app/[locale]/candle-care/page.tsx`         | `'use client'`                          |
| `/[locale]/contact`         | `src/app/[locale]/contact/page.tsx:19`          | `'use client'`, non-functional form     |

**Absent file conventions:** `not-found.tsx`, `global-not-found.tsx`, `error.tsx`, `loading.tsx`, `sitemap.ts`,
`robots.ts`, `manifest.ts`, `opengraph-image`. No `public/robots.txt`.

### Data model

The entire "model" is `src/types/product.ts:1-49`:

```
slug, scent, name, mood, descriptor, description,
scentNotes{top,heart,base}, ingredients[], accentColor,
glowColor?, emoji, highlight?, seasonal, price?, imagePath, hoverImagePath?
```

`price` is **optional** (`src/types/product.ts:42-45`) and is **not set on a single one of the six products** (
`src/data/products.ts:3-218`). There is no `id`, `sku`, `stock`, `weight`, `dimensions`, `vatRate`, `variants`, or
`active` field.

### Commerce functionality: exists / stubbed / absent

| Capability                                | Status                                                                                                                                                                               |
|-------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Product catalogue (read-only, hard-coded) | **Exists** — `src/data/products.ts:3-218`                                                                                                                                            |
| Product detail page                       | **Exists** — `src/app/[locale]/products/[slug]/page.tsx`                                                                                                                             |
| Price display                             | **Absent** — no product has a price                                                                                                                                                  |
| Add to cart                               | **Stubbed** — permanently `disabled` button labelled "Add to cart — coming soon" (`src/app/[locale]/products/[slug]/page.tsx:101-106`, `messages/en.json:62`, `messages/bg.json:62`) |
| Cart, checkout, orders, customers, admin  | **Absent**                                                                                                                                                                           |
| Payments, shipping, invoicing, email      | **Absent**                                                                                                                                                                           |
| Contact form                              | **Stubbed** — fake (`src/app/[locale]/contact/page.tsx:27-39`)                                                                                                                       |

### Unfinished scaffolding / dead code

- `src/components/home/ScentsStrip.tsx` (47 lines) — defined, imported nowhere.
- `src/components/ui/GlowingCursor.tsx` — file name and default export disagree (`export default function CursorGlow`,
  `:5`); removed from the layout in commit `170ca22`, file left behind.
- `react-parallax-tilt` in `package.json:16` — imported nowhere.
- `public/images/products/{cherry,orange,vanilla,strawberry,espresso-martini}.jpg` — superseded by the `IMG_75xx.webp`
  set, now unreferenced.
- `README.md` — unmodified `create-next-app` boilerplate.
- `docs/superpowers/{specs,plans}/2026-04-02-creamy-minimal-redesign.md` — design spec, fully implemented.

---

## 2. Blocking for launch

> "Blocking" = a customer cannot complete a purchase, or the shop is exposed legally/financially/reputationally from day
> one.

| ID       | Area            | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                               | Evidence                                                                                                                                                                                                                                                  | Risk                                                                      | Effort                  |
|----------|-----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------|-------------------------|
| **B-01** | Commerce core   | **DONE (Q-34).** ~~No persistence layer of any kind.~~ Neon Postgres via drizzle, migrations in `drizzle/`, connection validated in `src/lib/env.ts`. Orders, their snapshotted lines and an append-only status log are written by `src/lib/orders.ts`. Carts and customers are still not stored: the cart travels in the URL (B-05) and checkout is guest-only by decision (Q-31).                                                                                                                                                                                                                                                         | `package.json:11-18`; no `.env*`; no `process.env` reference in `src/`                                                                                                                                                                                    | Cannot transact at all                                                    | **L**                   |
| **B-02** | Commerce core   | **No API routes.** `src/app/api/` does not exist. There is no server-side surface to create orders, take payments, receive webhooks or talk to couriers.                                                                                                                                                                                                                                                                                              | verified — no `route.ts` in repo                                                                                                                                                                                                                          | Cannot transact                                                           | **L**                   |
| **B-03** | Commerce core   | **DONE for price (Phase 1b) — every scent is 19,99 €, the owner's real figure; the packed weight beside it is still a 500 g placeholder (Q-12).** ~~No product has a price.~~ Prices live in `src/data/pricing.ts` keyed by slug, in integer EUR cents. `PRICING_IS_PROVISIONAL` is `true` while any weight is a guess, which puts a visible notice on checkout. Unpriced products would render "price on request", never a blank or a zero.                                                                                                                                                                                                                                                                                                       | `src/types/product.ts:42-45`; `src/data/products.ts:3-218`                                                                                                                                                                                                | Cannot sell                                                               | **M**                   |
| **B-04** | Commerce core   | **PARTIAL (Phase 1a) — packed weight is now modelled** in `src/data/pricing.ts` (`packedWeightGrams`, feeding the courier weight bands), and `isPurchasable()` gates on price + weight + season. Still missing: `id`, `sku`, `stock`/inventory, dimensions, `vatRate`, variants/size options, `active` flag. Only one image per product plus an optional hover image.                                                                                                                                                                                             | `src/types/product.ts:1-49`                                                                                                                                                                                                                               | Cannot price shipping, cannot prevent overselling                         | **M**                   |
| **B-05** | Commerce core   | **STOPGAP ONLY (Phase 1b) — the basket lives in the query string** (`src/lib/cart-params.ts`, `?items=cherry:2`), enough to walk the order flow. Still no cart state, no storage (cookie/localStorage/server), no guest-vs-logged-in strategy, no "add to basket", no persistence across a session. Safe because the URL carries only slugs and quantities and the server re-prices — but **delete that module when the real cart lands rather than extending it**.                                                                                                                                                                                                                                                                                                                                   | verified — no cart module in `src/`                                                                                                                                                                                                                       | Cannot transact                                                           | **M**                   |
| **B-06** | Commerce core   | **DONE (Phase 1b).** ~~Add to cart is a permanently disabled button~~ with the label baked into both locale files as "coming soon". A purchasable product now links to `/{locale}/checkout?items={slug}:1`; out-of-season products (`winter-wonderland`) still show a disabled "not available yet" control, because `isPurchasable()` gates on season independently of price.                                                                                                                                                                                                                                                                                                                                        | `src/app/[locale]/products/[slug]/page.tsx:101-106`; `messages/en.json:62`; `messages/bg.json:62`                                                                                                                                                         | Shop is visibly non-functional                                            | **S** (once B-05 lands) |
| **B-07** | Commerce core   | **PARTIAL (Phase 1a) — address capture, courier and delivery-method selection, payment-method selection and server-side re-pricing exist** at `/[locale]/checkout` with a validated Server Action. Orders are now stored and the customer is given an order number (B-01/B-09); `readyToPay` remains only where no database is configured. Still missing: a confirmation email (B-17), a confirmation page, and a real cart behind the summary (B-05). Payment is not missing — наложен платеж needs none (Q-20 closed).                                                                                                                                                                                                                                                                                                                                       | verified                                                                                                                                                                                                                                                  | Cannot transact                                                           | **L**                   |
| **B-08** | Commerce core   | **No order model or state machine.** No order numbers, no status transitions, no immutable snapshot of prices/items/shipping at time of purchase. Without a snapshot, editing a product price later silently rewrites historical orders and invoices.                                                                                                                                                                                                 | verified                                                                                                                                                                                                                                                  | Financial/legal integrity                                                 | **M**                   |
| **B-09** | Commerce core   | **DONE (Q-34).** ~~No idempotency anywhere~~ — the checkout page mints an intent token per render, the form replays it, and the unique index on `orders.intent_token` makes a double-click, a refresh or two racing requests resolve to one order. Verified against the live database.                                                                                                                                                                                                                                                               | verified                                                                                                                                                                                                                                                  | Duplicate charges, duplicate shipments                                    | **M**                   |
| **B-10** | Payments        | **CLOSED BY DECISION (2026-09-20): there will be no card payments.** ~~Stripe is not integrated.~~ Наложен платеж is the only method (`src/lib/payments.ts`). No payment dependency, no keys, no session creation — and none owed.                                                                                                                                                                                                                                                                                                      | `package.json:11-18`                                                                                                                                                                                                                                      | Cannot take card payments                                                 | **L**                   |
| **B-11** | Payments        | **CLOSED BY DECISION (2026-09-20).** ~~No webhook endpoint.~~ With no card provider there is no payment webhook to secure and nothing that can mark an order paid: the `paid` and `pending_payment` statuses and the `webhook_events` table have been removed from the schema. What replaces the risk is reconciliation of the courier's COD remittance (B-14), which is bookkeeping rather than an untrusted request.                                                                                                                                                                                 | verified                                                                                                                                                                                                                                                  | Fraudulent "paid" orders; missed payments                                 | **M**                   |
| **B-12** | Payments        | **DONE (Phase 1a) — `src/lib/money.ts`: EUR, integer minor units, currency-checked arithmetic.** ~~Currency is undefined in code.~~ `Product.price.currency` is a free-form `string` that is never populated, so there is no hardcoded `BGN` to fix — but there is also no decision recorded. Bulgaria adopted the euro on 2026-01-01 (per your brief). Prices must be authored natively in **EUR integer minor units (cents)**, never floats. Any BGN/EUR dual-display obligation still in force, and its end date, is **`[VERIFY]`** — see §5 Q-14.  | `src/types/product.ts:42-45`; no currency literal anywhere in `src/`                                                                                                                                                                                      | Mispricing, rounding drift, non-compliant display                         | **M**                   |
| **B-13** | Shipping        | **No courier integration.** Nothing for Speedy or Econt: no office/APS picker, no shipping price calculation, no waybill (товарителница) generation, no tracking number storage, no tracking sync, no customer tracking link.                                                                                                                                                                                                                         | verified                                                                                                                                                                                                                                                  | Cannot fulfil orders                                                      | **L**                   |
| **B-14** | Shipping        | **No наложен платеж (COD) support.** Given COD is the dominant BG payment habit, this is the single largest revenue-path gap after B-01. COD orders are *not* paid at checkout, which the (non-existent) order state machine must model explicitly — see §6 Phase 4.                                                                                                                                                                                  | verified                                                                                                                                                                                                                                                  | Loses the majority of the BG market                                       | **L**                   |
| **B-15** | Legal           | **PARTIAL — six pages scaffolded in both locales (Phase 0.7); NOT lawyer-reviewed, ~20 `[TODO]` markers remain.** ~~Zero legal pages exist.~~ No Общи условия, no Политика за поверителност, no Политика за бисквитките, no Право на отказ/връщане, no Рекламации, no Delivery information. The footer links only to Home/Products/Our Story/Candle Care/Contact.                                                                                                                                                                                                       | `src/components/layout/Footer.tsx:12-18`; no legal route in `src/app/[locale]/`                                                                                                                                                                           | Regulatory exposure from first sale **`[VERIFY scope with a BG lawyer]`** | **M**                   |
| **B-16** | Legal           | **DONE (Phase 0.7) — „ВиреонЛабс“ ЕООД, ЕИК 208907603 in the footer site-wide and in full on every legal page. VAT number, address and управител still `[TODO]`.** ~~No trader identification (impressum).~~ The footer shows only the brand name and a copyright line — no legal entity name, ЕИК, VAT number, registered address, email, or supervisory authority (КЗП) contacts. The only contact details on the whole site are a phone number and an Instagram handle.                                                                                                                                               | `src/components/layout/Footer.tsx:62-64`; `src/app/[locale]/contact/page.tsx:66-90`                                                                                                                                                                       | Regulatory exposure; consumer trust                                       | **S**                   |
| **B-17** | Email           | **FOUNDATION ONLY (Phase 0.7) — `src/lib/mailer.ts` defines the contract and reports `unconfigured`; no provider chosen, nothing sends yet.** ~~No transactional email of any kind.~~ No provider, no templates, no sending domain, no queue. A customer who ordered would receive nothing — no confirmation, no receipt, no tracking.                                                                                                                                                                                                                                                              | `package.json:11-18`                                                                                                                                                                                                                                      | Order confirmation is a legal and practical necessity **`[VERIFY]`**      | **M**                   |
| **B-18** | GDPR            | **No customer data handling at all** — no lawful-basis record, no consent capture or timestamps, no retention policy, no deletion/anonymisation, no DSAR export/delete, no sub-processor list. Nothing to fix yet, but all of it must be designed *with* the commerce build rather than after.                                                                                                                                                        | verified                                                                                                                                                                                                                                                  | Compliance exposure once the first order is stored                        | **M**                   |
| **B-19** | Frontend / data | **Five product images referenced in data do not exist.** Every product except `winter-wonderland` points `hoverImagePath` at `IMG_75xx_alt.webp`; `public/images/candles/` contains only `IMG_7520–7524.webp` with no `_alt` variants. Each is rendered with `priority`, so the browser **preloads** five guaranteed 404s on the homepage and again on the products page.                                                                             | `src/data/products.ts:37,73,109,145,181`; `src/components/products/ProductCard.tsx:49-61`, `:55`; `ls public/images/candles/`                                                                                                                             | Visible defect, wasted bandwidth, console noise                           | **S**                   |
| **B-20** | Frontend        | **DONE (Phase 0.7) — real `/api/contact` with validation, rate limiting and a honeypot; returns 503 and tells the customer to phone while email is unconfigured, instead of faking success.** ~~The contact form is fake.~~ `handleSubmit` awaits a 1000 ms `setTimeout` and then unconditionally shows "Message sent! We'll get back to you soon." No network call, no persistence, no email. The `catch` branch and the `error` state (`:25`, `:150`) are unreachable. Customer enquiries — including order enquiries — are silently destroyed while the customer is told otherwise.                                                              | `src/app/[locale]/contact/page.tsx:27-39`, `:96-106`                                                                                                                                                                                                      | Data loss + actively misleading the customer                              | **S**                   |
| **B-21** | Security        | **No security headers and no CSP.** `next.config.ts` exports `withNextIntl({})` with no `headers()`. No `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy`. This becomes acute the moment the site collects addresses and phone numbers.                                                                                                                                     | `next.config.ts:1-5`                                                                                                                                                                                                                                      | XSS blast radius, protocol downgrade, referrer leakage                    | **S**                   |
| **B-22** | i18n            | **Bulgarian customers see English product content.** All product names, descriptors, descriptions, scent notes and ingredients live in a single English array with no translations; `mood` and `highlight` badges render raw English strings. Several UI strings are also hardcoded English regardless of locale. For distance selling to BG consumers, pre-contractual product information needs to be in a language they understand **`[VERIFY]`**. | `src/data/products.ts:3-218`; `src/components/products/ProductCard.tsx:66`, `:97`; `src/components/home/Hero.tsx:43`; `src/components/home/ScentGrid.tsx:28`; `src/app/[locale]/products/page.tsx:21-22`; `src/app/[locale]/contact/page.tsx:105`, `:157` | Half the catalogue is untranslated for the primary market                 | **M**                   |
| **B-23** | Frontend        | **No 404 or error page.** No `not-found.tsx`, `global-not-found.tsx` or `error.tsx`. Because the root layout sits under the dynamic `[locale]` segment, unmatched URLs have no layout to render into and fall through to Next's built-in pages — unstyled, English-only, no navigation. The Next 16 docs call out exactly this case (root layout under a top-level dynamic segment) as the reason `global-not-found.js` exists.                       | no such files in `src/app/`; `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md:53-56`; `.../02-guides/production-checklist.md:88`                                                                                     | Broken UX on every typo'd or stale URL                                    | **S**                   |

---

## 3. Should fix before launch

| ID       | Area          | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Evidence                                                                                                                                    | Risk                                                                   | Effort |
|----------|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|--------|
| **S-01** | Quality       | **Test suite is red: 18 of 42 tests fail across 6 of 10 files.** Dominant cause is `ReferenceError: IntersectionObserver is not defined` (127 occurrences) — `framer-motion`'s `whileInView` needs it and the setup file only imports `jest-dom`. Fix before building checkout logic, or you build pricing code with no working safety net.                                                                                                                                                                                                                                                                           | `src/test/setup.ts:1`; `src/components/home/ScentGrid.tsx:20`; `npx vitest run`                                                             | No regression protection                                               | **S**  |
| **S-02** | Quality       | **DONE (Phase 1a) — `Product.price` removed from the type; the test now asserts the field is absent, so pricing has one source.** ~~A data test asserts a field that cannot exist.~~ `expect(p.price).toBeNull()` fails because `price` is `undefined`, never `null`. The test encodes "products have no price" as intended behaviour — delete or invert it when B-03 lands.                                                                                                                                                                                                                                                                                                                                                                            | `src/data/__tests__/products.test.ts:16`                                                                                                    | Misleading test; blocks green CI                                       | **S**  |
| **S-03** | Quality       | **`tsc --noEmit` reports 2 errors** — both tests pass a `params` argument to page components that take none.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `src/app/[locale]/candle-care/__tests__/page.test.tsx:8`; `src/app/[locale]/our-story/__tests__/page.test.tsx:12` (TS2554)                  | Type-check cannot gate CI                                              | **S**  |
| **S-04** | Quality       | A product-detail test fails with `TypeError: Cannot read properties of undefined (reading 'slug')`. This is a **test-harness artefact, not a production bug**: the test mocks `notFound` as a no-op so execution continues past line 143, whereas the real `notFound()` throws. Mock it to throw.                                                                                                                                                                                                                                                                                                                     | `src/app/[locale]/products/[slug]/__tests__/page.test.tsx:11-14`, `:46-49`; `src/app/[locale]/products/[slug]/page.tsx:27`, `:141-143`      | False alarm masking real failures                                      | **S**  |
| **S-05** | Security      | **5 dependency vulnerabilities in production deps (3 high).** `sharp` <0.35.0 inherits libvips CVEs; `postcss` ≤8.5.22 has a path-traversal advisory; `next` itself is flagged. All resolve with `next@16.3.0` (not a semver-major bump). Real-world exploitability here is low — `sharp` only processes first-party build-time images and `postcss` is build-time — but it should be clean before launch.                                                                                                                                                                                                            | `npm audit --omit=dev`: `next` high, `postcss` high, `sharp` high, `next-intl` moderate, `icu-minify` low                                   | Supply-chain exposure                                                  | **S**  |
| **S-06** | Accessibility | **Contact form labels are not associated with their inputs.** All three `<label>` elements lack `htmlFor` and the inputs lack `id`. Screen readers announce unlabelled fields; clicking a label does not focus its input. There is also no `aria-live` region on the success/error state.                                                                                                                                                                                                                                                                                                                             | `src/app/[locale]/contact/page.tsx:116-124`, `:128-137`, `:140-147`, `:96-106`, `:150`                                                      | WCAG 1.3.1 / 3.3.2 failure                                             | **S**  |
| **S-07** | Accessibility | **Mobile menu is not an accessible dialog.** No `role="dialog"`/`aria-modal`, no focus trap, no focus restore on close, no `Escape` handler, no body scroll lock, and the close button (`✕`) has no accessible name. The burger button has `aria-label` but no `aria-expanded`/`aria-controls`.                                                                                                                                                                                                                                                                                                                       | `src/components/layout/Navbar.tsx:92-133`, `:101-106`, `:78-82`                                                                             | Keyboard/AT users can be trapped behind the overlay                    | **S**  |
| **S-08** | Accessibility | **Two text colours fail WCAG AA contrast on the cream background.** `ink-ghost` `#9B8E82` on `cream-base` `#F6F1EB` ≈ **2.8:1** (needs 4.5:1) and is used for body-size metadata throughout. `ink-secondary` `#7A7065` ≈ **4.3:1** — marginally under 4.5:1 for normal text (passes 3:1 for large text).                                                                                                                                                                                                                                                                                                              | `tailwind.config.ts:16-19`, `:9`; used at `src/app/[locale]/products/page.tsx:20`, `src/components/products/ProductCard.tsx:96`, and widely | WCAG 1.4.3 failure                                                     | **S**  |
| **S-09** | SEO           | **No sitemap, no robots.txt.** Neither `src/app/sitemap.ts`/`robots.ts` nor `public/robots.txt` exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | verified                                                                                                                                    | Poor discovery/indexation                                              | **S**  |
| **S-10** | SEO           | **Every page has the same title, `"55candles"`, and no description beyond the site-wide one.** `generateMetadata` lives only in the locale layout; no page defines its own. Product pages — the ones that should rank — have no unique title, description, canonical or OG image.                                                                                                                                                                                                                                                                                                                                     | `src/app/[locale]/layout.tsx:29-40`; no `generateMetadata` in any `page.tsx`                                                                | Products will not rank                                                 | **M**  |
| **S-11** | SEO           | **No `metadataBase`, no Open Graph or Twitter tags, no `hreflang` alternates, no canonical URLs.** Links shared to social media will render with no image or description, and the `en`/`bg` variants are not declared as alternates of each other.                                                                                                                                                                                                                                                                                                                                                                    | grep for `metadataBase\|openGraph` returns nothing                                                                                          | Weak social/search presentation; duplicate-content risk across locales | **S**  |
| **S-12** | SEO           | **PARTIAL (Phase 0.7) — `Organization` + `BreadcrumbList` shipped. `Product`/`Offer` still gated on B-03 prices.** ~~No structured data.~~ No `Product`, `Offer`, `Organization` or `BreadcrumbList` JSON-LD. `Offer` requires a price, so this is gated on B-03.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | verified                                                                                                                                    | No rich results                                                        | **S**  |
| **S-13** | Performance   | **`priority` is set on every product image.** Six cards on the homepage and six on the products page each preload a base image — plus a hover image that 404s (B-19). `priority` is meant for the LCP element only; using it everywhere defeats lazy loading and delays the true LCP.                                                                                                                                                                                                                                                                                                                                 | `src/components/products/ProductCard.tsx:38`, `:54`; `src/app/[locale]/products/[slug]/page.tsx:51`                                         | LCP/CWV regression on mobile                                           | **S**  |
| **S-14** | Performance   | **DONE — see "Phase 0.6 status" above.** ~~Nearly the entire site is client-rendered.~~ `Navbar`, `Footer`, `ProductCard`, `Hero`, `ScentGrid`, and the contact/our-story/candle-care pages are all `'use client'`, so `framer-motion` ships on every route. `NextIntlClientProvider` is handed the **entire** message catalogue on every page.                                                                                                                                                                                                                                                                                                                | `src/app/[locale]/layout.tsx:55`; `'use client'` at the top of the components above                                                         | Larger JS bundle, slower hydration                                     | **M**  |
| **S-15** | Ops           | **No CI, no deploy config, no error monitoring, no logging, no health check, no staging/production separation, no backup or rollback plan.** No `.github/`, `Dockerfile`, `vercel.json` or `.nvmrc`. Hosting target is undeclared.                                                                                                                                                                                                                                                                                                                                                                                    | repo root listing                                                                                                                           | Cannot deploy or operate safely                                        | **M**  |
| **S-16** | Ops           | **README is untouched `create-next-app` boilerplate** — no setup, env, deploy or runbook documentation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `README.md:1-3`                                                                                                                             | Onboarding/bus-factor risk                                             | **S**  |
| **S-17** | Legal         | **No cookie consent banner.** Currently the site loads **no** analytics, tag manager, pixel or third-party tracker (verified by grep for `gtag`, `googletagmanager`, `analytics`, `fbq`, `facebook`, `pixel`, `hotjar`, `clarity`), so nothing non-essential fires today — you are compliant by accident. The moment GA/Meta Pixel is added this becomes **blocking**. Build the consent gate *before* the first tracker, with granular categories, reject-all as prominent as accept-all, and a re-open mechanism. Note `next/font/google` self-hosts fonts at build time, so it makes no runtime request to Google. | grep returns no tracker references; `src/app/[locale]/layout.tsx:11-22`                                                                     | Becomes blocking on first tracker                                      | **M**  |

---

## 4. Nice to have / post-launch

| ID       | Area          | Finding                                                                                                                                                                                                                         | Evidence                                                                                        | Risk                                               | Effort                     |
|----------|---------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|----------------------------------------------------|----------------------------|
| **N-01** | Housekeeping  | `ScentsStrip.tsx` is dead code — defined, imported nowhere.                                                                                                                                                                     | `src/components/home/ScentsStrip.tsx:10`                                                        | Confusion                                          | S                          |
| **N-02** | Housekeeping  | `GlowingCursor.tsx` is dead code and its export name disagrees with the filename (`CursorGlow`). Removed from the layout in `170ca22`.                                                                                          | `src/components/ui/GlowingCursor.tsx:5`                                                         | Confusion                                          | S                          |
| **N-03** | Housekeeping  | `react-parallax-tilt` is a dependency but imported nowhere.                                                                                                                                                                     | `package.json:16`                                                                               | Bundle/audit noise                                 | S                          |
| **N-04** | Housekeeping  | Five superseded product JPEGs are unreferenced (`cherry`, `orange`, `vanilla`, `strawberry`, `espresso-martini`).                                                                                                               | `public/images/products/` vs `src/data/products.ts`                                             | Repo weight                                        | S                          |
| **N-05** | Content       | Testimonials are hardcoded with named individuals ("Анна М.", "София К.", "Мартин Д."). If these are not real, attributed reviews, presenting them as customer testimonials is a misleading-commercial-practice risk. See Q-19. | `messages/bg.json:30-38`; `messages/en.json:30-38`                                              | Consumer-law exposure                              | S                          |
| **N-06** | Content       | Homepage CTA says "Six scents" as a hardcoded string while the products page derives the count dynamically. These will disagree the moment a scent is added.                                                                    | `messages/en.json:41` vs `src/app/[locale]/products/page.tsx:21`                                | Content drift                                      | S                          |
| **N-07** | i18n          | The `LanguageSwitcher` builds hrefs with `pathname.replace(/^\/(en                                                                                                                                                              | bg)/, ...)` and drops query strings and hashes. Harmless today; will lose checkout state later. | `src/components/layout/LanguageSwitcher.tsx:12-14` | State loss during checkout | S |
| **N-08** | Frontend      | The hero headline is split on whitespace to italicise the last word. This is fragile across locales and breaks if a translation ends in punctuation or a multi-word phrase.                                                     | `src/components/home/Hero.tsx:55-58`                                                            | Typographic glitch in BG                           | S                          |
| **N-09** | Accessibility | `prefers-reduced-motion` is not respected anywhere despite heavy `framer-motion` use.                                                                                                                                           | `src/app/globals.css:1-10`; all `motion.*` usages                                               | WCAG 2.3.3 (AAA) / comfort                         | S                          |
| **N-10** | Frontend      | Image `alt` text is just `product.name` ("Cherry"), and the hero's is `"55candles hero"`. Descriptive alt text would serve both AT users and image search.                                                                      | `src/components/products/ProductCard.tsx:36`, `:53`; `src/components/home/Hero.tsx:20`          | Minor a11y/SEO                                     | S                          |
| **N-11** | Commerce      | No wishlist, no product reviews, no search/filter by scent or mood, no gift wrapping, no discount codes, no abandoned-cart recovery. All reasonable v2.                                                                         | —                                                                                               | Growth                                             | M–L                        |
| **N-12** | Ops           | **DONE (Phase 0.7).** ~~No `.env.example`~~ to document required configuration once B-01 lands.                                                                                                                                                           | verified                                                                                        | Onboarding                                         | S                          |

---

## 5. Open questions for the owner

These cannot be determined from the code. **Nothing below has been guessed.**

### Company & legal identity

- **Q-01** What is the exact legal entity name and form (ЕООД / ООД / ЕТ / физическо лице)?
- **Q-02** ЕИК/Булстат, registered address, and correspondence address for the impressum?
- **Q-03** Are you VAT-registered (регистрация по ЗДДС)? If not, are you tracking turnover against the registration
  threshold? `[VERIFY WITH ACCOUNTANT]`
- **Q-04** Official business email address? Right now the site publishes only a phone number (`+359 887 115 957`) and
  `@55candles.bg` on Instagram (`src/app/[locale]/contact/page.tsx:67`, `:79`).
- **Q-05** Do you have a Data Protection Officer, or is one required for your scale? `[VERIFY]`
- **Q-06** What domain will this deploy to? Needed for `metadataBase`, canonicals, cookie scope, email SPF/DKIM/DMARC,
  and courier webhook URLs. **Answered 2026-09-20: `55candles.com`** (bare domain canonical).

### Selling scope

- **Q-07** BG only, or EU-wide? This determines OSS VAT registration, cross-border shipping rates, and how many
  languages the legal pages need. `[VERIFY WITH ACCOUNTANT]`
- **Q-08** B2C only, or also B2B (wholesale/gift orders)? The contact page copy mentions "gift orders" (
  `messages/en.json:92`).
- **Q-09** Physical address customers return goods to?
- **Q-10** Who pays return shipping on a withdrawal — you or the customer? This must be stated *before* purchase.
  `[VERIFY]`

### Product & pricing

- **Q-11** Price per scent, and are there size variants? The model supports neither today.
- **Q-12** **Net weight and packed dimensions per product** — both couriers price on weight/volume, so shipping cannot
  be calculated without these.
- **Q-13** Are prices to be displayed VAT-inclusive? (Consumer-facing prices normally are. `[VERIFY WITH ACCOUNTANT]`)
- **Q-14** **Euro/BGN dual display:** Bulgaria adopted the euro on 2026-01-01. Is a dual BGN+EUR display obligation
  still in force as of today, and until what date? Please confirm against the current rule rather than my assumption.
  `[VERIFY]`
- **Q-15** Stock: do you track real inventory, or make to order? This decides whether we need reservations and oversell
  protection.
- **Q-16** **Candle safety / CLP:** do your candles require CLP hazard labelling, and must fragrance-allergen disclosure
  appear on the *product page* as well as the physical label? I have deliberately not concluded either way.
  `[VERIFY with a CLP/cosmetics-regulatory adviser]`
- **Q-17** **Withdrawal-right exemption:** does the sealed/hygiene-goods exemption apply to any of your candles? I am
  flagging this as a **question, not a conclusion** — candles are not obviously within it, and getting it wrong in
  either direction is costly. `[VERIFY]`
- **Q-18** Warranty/conformity period you will state for рекламации? `[VERIFY]`
- **Q-19** Are the three testimonials real, attributable customer reviews with permission to publish? (See N-05.)

### Payments & shipping

- ~~**Q-20** Stripe account country and default currency~~ — **ANSWERED 2026-09-20: no card payments at all.**
- ~~**Q-21** Card *and* COD from day one, or COD first?~~ — **ANSWERED: наложен платеж only, indefinitely.**
- **Q-22** Do you have Speedy and/or Econt merchant contracts yet, and API credentials for their test environments?
- **Q-23** Who absorbs the COD fee — you or the customer? It must be shown as a line item before the customer confirms.
- **Q-24** Free-shipping threshold, if any?
- **Q-25** Do you want to offer address-to-door, office pickup, and APS (автомат), or a subset?
- ~~**Q-26** Statement descriptor you want on customers' card statements?~~ — **moot: no card statements** (Q-20).

### Tax & invoicing — all `[VERIFY WITH ACCOUNTANT]`

- **Q-27** Do you issue фактури for every order, or only on request? What numbering series and who owns the sequence?
- **Q-28** **Наредба Н-18 / НАП e-shop obligations:** does this shop need to be registered with НАП as an e-shop, and
  what software declaration applies? Since every order is COD collected by the courier (whose fiscal device is
  typically involved), this is the *only* receipt path there is, which raises rather than lowers its importance. I am
  explicitly not answering it.
  `[VERIFY WITH ACCOUNTANT]`
- **Q-29** If selling EU-wide, will you register for OSS? `[VERIFY WITH ACCOUNTANT]`
- **Q-30** VAT calculation is yours to do — there is no payment provider's tax service to lean on (Q-20). How will it
  be calculated and evidenced? `[VERIFY WITH ACCOUNTANT]`

### Data & operations

- **Q-31** Do you want customer accounts, or guest checkout only? (Guest-only is a smaller build and a smaller GDPR
  surface — my recommendation for v1.)
- **Q-32** Newsletter at launch? If yes, double opt-in is the safe default. `[VERIFY]`
- **Q-33** How long do you need to retain order data? Accounting retention and GDPR minimisation pull in opposite
  directions. `[VERIFY WITH ACCOUNTANT]`
- **Q-34** Preferred hosting (Vercel is the path of least resistance for Next 16) and preferred email provider?
- **Q-35** **Consumer dispute resolution:** the EU ODR platform was discontinued in 2025, so I have deliberately *not*
  added the customary ODR link. What is the current required wording — a reference to the national ADR/КЗП conciliation
  commissions, or something else? `[VERIFY — do not copy boilerplate from another shop]`

### Raised during Phase 0

- **Q-36** **Do you have second/hover photos for the products?** Five products pointed at `IMG_75xx_alt.webp` files
  that were never committed, so each card preloaded a 404. I removed the dead data references but deliberately kept
  the hover-swap logic in `ProductCard` — if you supply the `_alt.webp` assets, re-adding `hoverImagePath` to
  `src/data/products.ts` turns the effect back on with no code change. If you have no second shots, say so and I'll
  strip the component logic too.

---

## 6. Recommended implementation order

Nine phases. Phases 0–1 are prerequisites for everything; 3 and 4 can run in parallel once 2 is done. Estimates assume
one developer.

### Phase 0 — Stabilise the existing site (~2–3 days)

Do this first; you are about to build pricing logic and need a working test suite.

1. Add an `IntersectionObserver` polyfill/stub to `src/test/setup.ts:1` → clears ~127 failures (S-01).
2. Fix `src/data/__tests__/products.test.ts:16` and the two TS2554 errors (S-02, S-03); make the `notFound` mock throw (
   S-04).
3. Fix or remove the five `hoverImagePath` references, or add the missing `_alt.webp` assets (B-19).
4. Remove `priority` from non-LCP images (S-13).
5. Delete dead code: `ScentsStrip`, `GlowingCursor`, `react-parallax-tilt`, orphaned JPEGs (N-01…N-04).
6. Add `not-found.tsx` / `global-not-found.tsx` and `error.tsx` (B-23).
7. Add security headers + a baseline CSP in `next.config.ts` (B-21).
8. Bump to `next@16.3.0` to clear the audit (S-05).
9. Stand up CI: `tsc --noEmit` + `vitest run` on every push (S-15).

**Gate:** `npm test` green, `tsc` clean, `npm audit --omit=dev` clean.

### Phase 1 — Foundations (~1 week)

1. Choose hosting (Q-34) and provision a **Postgres** database. Recommendation: Vercel + Neon/Supabase Postgres + *
   *Drizzle** or **Prisma** — either is fine; pick one and don't revisit.
2. Introduce `.env` handling with a validated schema (e.g. a `zod`-parsed `env.ts` that fails the build on missing vars)
   and commit a `.env.example` (N-12). Keep separate test and live key sets from day one.
3. Schema — first cut:
    - `product` (id, slug, active, **weight_grams**, sku, vat_rate) + `product_translation` (locale, name, descriptor,
      description, scent_notes, ingredients) → resolves B-04 and B-22
    - `product_price` (product_id, currency, **amount_minor INTEGER**, valid_from) → B-03/B-12; **never store money as
      float**
    - `inventory` (product_id, quantity, reserved)
    - `cart` / `cart_item`
    - `order` / `order_item` — with a **frozen snapshot** of name, unit price, VAT rate, quantity and shipping cost at
      purchase time (B-08)
    - `order_event` (append-only status log)
    - `payment`, `shipment`, `webhook_event` (for idempotency), `consent_record`
4. Migrate the six products out of `src/data/products.ts` into the DB, preserving slugs so existing URLs and
   `generateStaticParams` keep working.
5. **Author BG translations for all product content** (B-22) and move the hardcoded English UI strings into
   `messages/*.json`.
6. Add the currency decision as a single source of truth: prices in **EUR minor units**, all arithmetic in integers,
   formatting via `Intl.NumberFormat` per locale. Resolve Q-14 before writing the display component.

### Phase 2 — Cart & checkout, no payment yet (~1.5 weeks)

1. Server-side cart: cart id in an `httpOnly`, `secure`, `sameSite=lax` cookie; line items in the DB. Guest-only for
   v1 (Q-31).
2. `POST /api/cart/items` etc. — **the client sends product id + quantity only, never a price.** Every total is
   recomputed server-side on every mutation and again at checkout.
3. Checkout page: contact details → delivery method → address or office → summary → confirm.
4. Stock re-validation and price re-computation immediately before order creation; fail loudly if either changed since
   the cart was built.
5. **Idempotency (B-09):** generate an order-intent token when the checkout page loads; `POST /api/orders` carries it; a
   unique DB constraint on the token makes double-click and refresh no-ops that return the existing order.
6. Order number scheme, separate from the primary key — e.g. `55C-2026-000123`.
7. **Order state machine (B-08, B-14):** one path, because there is one payment method (Q-20 closed 2026-09-20).
   ```
   draft → awaiting_cod → confirmed → packed → shipped → delivered
                                                       → cod_collected → reconciled
                                                       → refused_at_delivery → returned
   any → cancelled | returned | refunded | partially_refunded
   ```
   No `paid` state: money reaches the shop through the courier's remittance, which is `cod_collected` → `reconciled`.
   Transitions go through one function that writes an `order_event` row. Nothing else mutates `order.status`.
8. Order confirmation page, addressed by order number + a random token (never a guessable sequential id).

**Gate:** unit tests for cart totals, VAT, shipping and idempotency. This is the code most worth testing.

### Phase 3 — Payments: nothing to build (closed 2026-09-20)

**This phase is cancelled by the owner's decision: there will be no card payments.** Наложен платеж is the only method.

What that removes from the plan, and from the code: the provider dependency and keys, the Checkout Session endpoint, the
signed webhook that was to be the payment source of truth, the `webhook_events` replay table, the `pending_payment` /
`payment_failed` / `paid` statuses, the statement descriptor (Q-26), the decline/retry UX, the provider's tax service
(Q-30) and the whole PCI conversation. `src/lib/payments.ts` is now a decision record rather than an integration.

What it does **not** remove, and what carries the weight instead: the money still has to be collected and reconciled, by
the courier, in Phase 4 — see **B-14**. An order is not settled when it is delivered; it is settled when the courier's
remittance is matched to it. And the receipt question gets *harder*, not easier: every sale is now courier-collected
cash under Наредба Н-18 (Q-28, `[VERIFY WITH ACCOUNTANT]`).

If this is ever reversed, treat it as a fresh design exercise — the superseded plan is in this file's git history
(`git log -p AUDIT.md`), but any provider, API version and SCA rule in it will need re-checking before it is trusted.

### Phase 4 — Couriers: Econt & Speedy, incl. наложен платеж (~1.5–2 weeks)

> **I have deliberately not written specific endpoint URLs, API version numbers or package names here.** Both couriers
> publish their own developer documentation and both have changed their APIs; everything below must be confirmed against
> their current docs and your merchant contract. `[VERIFY WITH COURIER DOCS]`

What I can say with confidence, and what needs checking:

- **Econt** publishes a JSON-over-HTTPS delivery/labels API with a separate demo environment, and offers an **embeddable
  office & APS picker widget** — the widget is the pragmatic choice because it stays current as offices open and close.
  `[VERIFY the current widget embed contract and the callback payload shape]`
- **Speedy** publishes a REST API covering rate calculation, shipment creation, label printing, tracking and *
  *office/APS listing**. There is no official widget, so you render the picker yourself from their office list.
  `[VERIFY endpoints, auth scheme and whether a sandbox is available]`
- Do **not** install an unofficial npm wrapper for either. Write a thin internal client per courier behind one shared
  interface.

Steps:

1. Define a `CourierAdapter` interface — `quote()`, `listOffices()`, `createWaybill()`, `track()`, `cancelWaybill()` —
   and implement it twice. The rest of the app never imports a courier SDK directly.
2. Obtain test credentials (Q-22). Store per-courier credentials in env vars, never in code.
3. **Office/APS picker:** Econt via widget, Speedy via office-list API with client-side search. On selection, persist on
   the order a **snapshot**: `courier`, `office_id`, `office_name`, `office_address`, `city`, `postcode`, `captured_at`.
   Re-validate the office id before creating the waybill — offices close.
4. **Shipping price:** compute server-side from summed product weight (Q-12) + packaging weight, per courier, per
   delivery type (door vs office vs APS), with the free-shipping threshold (Q-24) applied after. Cache office lists;
   never quote from the client.
5. **COD (наложен платеж):**
    - order goes to `awaiting_cod`, and there is no `paid` status to skip to (Q-20)
    - amount to collect = goods + shipping + COD fee if passed to the customer (Q-23); show it as an explicit line
      before confirmation
    - set the COD amount on the waybill; store the returned COD reference
    - **reconciliation:** import the courier's payout report, match by waybill number, transition
      `cod_collected → reconciled`, and alert on any shipment delivered more than N days ago without a matching payout
    - handle `refused_at_delivery` → return leg → restock
6. **Waybill (товарителница):** generate on transition to `packed`; store waybill number, label PDF reference and
   courier response. Creation must be idempotent — never let a retry produce two waybills for one order.
7. **Tracking:** store the number on the order, expose a customer-facing tracking link, and sync status on a schedule (
   or via courier webhook if offered) into `order_event`.
8. **Failure handling:** timeouts and retries with backoff on every courier call; a circuit breaker so a courier outage
   does not take checkout down; graceful degradation to "we will confirm your delivery cost by phone" rather than a 500;
   validate weight limits and address completeness *before* submitting.

### Phase 5 — Legal & compliance (~3–5 days of build, plus review time)

Build the pages as real, reachable, footer-linked routes under `src/app/[locale]/legal/*`, in **both BG and EN**, with
BG authoritative. Outlines below are **structure only** — every company-specific fact is a `[TODO]` and none of it is
legal advice. **Have a Bulgarian lawyer review before launch.**

**Общи условия** — `/legal/terms`
> `[TODO: legal entity, ЕИК, address, ДДС №]` · scope and acceptance · how a contract is concluded (order →
> confirmation) · prices and currency, VAT inclusion `[TODO]` · payment methods incl. наложен платеж and its fee
`[TODO]` · delivery couriers, methods, timeframes, costs `[TODO]` · risk transfer · withdrawal right (cross-reference) ·
> conformity guarantee and рекламации · liability · personal data (cross-reference) · dispute resolution
`[TODO — see Q-35]` · governing law · amendment procedure and version date.

**Политика за поверителност** — `/legal/privacy` (GDPR Art. 13/14)
> Controller identity and contacts `[TODO]` · DPO if any `[TODO: see Q-05]` · **a table of purpose → data categories →
lawful basis → retention**, minimally: order fulfilment (contract), invoicing/accounting (legal obligation, retention
> per Q-33), marketing (consent), fraud prevention (legitimate interest), essential cookies (necessity) · recipients/*
*sub-processors** — Speedy, Econt, email provider, hosting, and analytics if added (no payment processor: Q-20)
`[TODO: confirm each provider and whether any transfers data outside the EU/EEA, and on what safeguard]` · data-subject
> rights incl. access, rectification, erasure, portability, objection, withdrawal of consent · right to complain to **КЗЛД
** `[TODO: current contact details]` · whether provision of data is a contractual requirement · no automated
> decision-making (confirm) · version date.

**Политика за бисквитките** — `/legal/cookies`
> What cookies are · **a table: name, purpose, category, duration, first/third party** — today the only cookies would be
> your own cart/session cookies, so the table is short and honest · how to change consent (link that re-opens the
> banner) · browser controls. Update this table in the same commit as any new tracker.

**Право на отказ / връщане** — `/legal/withdrawal`
> 14-day withdrawal right `[VERIFY period and start-of-period rules]` · how to exercise it · **standard withdrawal form
** (downloadable and inline) · return address `[TODO: Q-09]` · **who pays return shipping** `[TODO: Q-10]` · refund
> timing and method · condition requirements · **any exemption for sealed/hygiene
goods — `[TODO: Q-17, do not state either way until confirmed]`**.

**Рекламации** — `/legal/complaints`
> Legal conformity guarantee and its period `[TODO: Q-18]` · what counts as non-conformity · remedies hierarchy (
> repair/replace/price reduction/rescission) `[VERIFY]` · how to file a рекламация and what to include · response
> timeframe `[TODO]` · **КЗП** contact details `[TODO: current address, phone, website]`.

**Доставка и плащане** — `/legal/delivery`
> Couriers and methods (door / office / APS) · **cost table by weight and method** `[TODO: Q-12, Q-24]` · timeframes
`[TODO]` · **наложен платеж and its fee** `[TODO: Q-23]` · card payment · what happens on a failed delivery · geographic
> coverage `[TODO: Q-07]`.

**Footer impressum (B-16)** — every page:
> `[TODO: legal entity name and form]` · ЕИК `[TODO]` · ДДС № `[TODO if registered]` · registered address `[TODO]` ·
> email `[TODO: Q-04]` · phone (`+359 887 115 957`, already published at `src/app/[locale]/contact/page.tsx:67`) · link to
> КЗП `[TODO]` · links to all legal pages.

**Cookie banner (S-17)** — build before the first tracker: blocks all non-essential scripts until opt-in; granular
categories (essential / analytics / marketing); **reject-all must be exactly as easy and as prominent as accept-all**;
consent stored with a timestamp and policy version; a persistent "Настройки за бисквитки" link in the footer to change
it later. Add an automated check that no analytics script tag can be injected before consent state resolves.

### Phase 6 — GDPR technical & transactional email (~1 week)

1. `consent_record` table: subject, purpose, granted/withdrawn, timestamp, IP, policy version. **Marketing consent
   stored separately from order processing** — never inferred from a purchase.
2. Newsletter (if Q-32 is yes): double opt-in with a tokenised confirmation link; one-click unsubscribe in every
   marketing email; suppression list.
3. Retention jobs: scheduled anonymisation of order PII once the accounting retention window (Q-33) expires, keeping the
   financial record intact.
4. DSAR endpoints in the admin: export a customer's data as JSON, and delete/anonymise on request with an audit trail.
5. **PII hygiene:** structured logging with an explicit allowlist of loggable fields; redact email, phone, address and
   any courier payload before it reaches logs or the error monitor; scrub PII in the error-monitoring SDK's
   `beforeSend`.
6. Email provider (Q-34) with **SPF, DKIM and DMARC** on the sending domain (Q-06). Warm the domain before launch.
7. Templates in BG and EN: order confirmation, payment receipt / фактура, shipment + tracking link, cancellation,
   refund, COD reminder, password reset (only if accounts exist).
8. **Queue every email** — a job table with retries and exponential backoff. Never send inline in a request handler; a
   mail-provider outage must not fail a payment webhook.
9. Replace the fake contact form (B-20) with a real endpoint: persist + email, rate-limited, with honeypot or captcha
   and an explicit privacy-notice link at the point of submission.

### Phase 7 — Admin & invoicing (~1 week)

1. Minimal authenticated admin: order list and detail, status transitions, waybill creation, label download, refund
   trigger, COD reconciliation import.
2. Auth for it: strong password hashing (argon2id or bcrypt ≥12 rounds), `httpOnly`+`secure`+`sameSite` session cookies,
   rate-limited login with lockout, and CSRF protection on every mutating route.
3. **Authorization on every single route** — the default answer to "can user A read user B's order?" must be no,
   enforced server-side per request, not by hiding UI. Guest order lookup by opaque token only.
4. Rate limiting on login, checkout, contact and any courier-quote endpoint.
5. Invoice generation and numbering (Q-27) — sequential, gapless, immutable once issued. `[VERIFY WITH ACCOUNTANT]`
6. **Наредба Н-18 / НАП** obligations (Q-28) — resolve *before* launch, not after the first sale.
   `[VERIFY WITH ACCOUNTANT]`

### Phase 8 — Pre-launch hardening (~3–5 days)

1. SEO: `sitemap.ts`, `robots.ts`, `metadataBase`, per-page `generateMetadata`, canonical URLs, `hreflang` alternates
   for en/bg, OG images, and `Product`/`Offer`/`Organization` JSON-LD (S-09…S-12).
2. Accessibility pass: form labels, dialog semantics for the mobile menu, contrast tokens, `prefers-reduced-motion` (
   S-06…S-08, N-09). Re-test the whole checkout with a keyboard and a screen reader.
3. Performance: S-13 and S-14 are both done (server components, trimmed bundle, scoped message catalogue, image
   priorities). What remains here is measurement: Core Web Vitals on a throttled mobile connection, and a re-check
   after the cart and checkout add their own client code.
4. Ops: error monitoring, structured logging, `/api/health`, **database backups with a tested restore**, staging
   environment with courier demo credentials, and a written rollback plan (S-15, S-16).
5. Full end-to-end rehearsal on staging: browse → cart → checkout → order stored → email → waybill → tracking → cash
   collected → remittance reconciled, then a refused delivery, then a refund, then a withdrawal/return.
6. Final sweep: confirm no secret key in the client bundle, no PII in logs, no tracker firing before consent, and legal
   pages reachable from every page.

---

### Estimate

Roughly **7–9 developer-weeks** to a defensible launch, assuming the open questions in §5 are answered promptly and
legal review runs in parallel. The tightest external dependencies are the courier merchant contracts (Q-22) and the
accountant's answer on Наредба Н-18 (Q-28) — start both now, since they gate Phases 4 and 7 and are outside your
control.

*Every claim about existing code in this document cites a file and line. Every legal or tax statement is
marked `[VERIFY]` or `[VERIFY WITH ACCOUNTANT]` and none should be treated as advice. No code was changed in this pass.*
