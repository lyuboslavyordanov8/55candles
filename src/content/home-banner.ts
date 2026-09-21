/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE HOMEPAGE BANNER. EDIT THIS FILE — AND ONLY THIS FILE — TO CHANGE IT.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Everything the hero shows is below: the image, the alt text, the heading, the
 * subheading, the button's wording and where it points. Change any of them here
 * and the hero picks it up. You never need to open `Hero.tsx` to swap a banner.
 *
 * ── To swap the image ──────────────────────────────────────────────────────
 *  1. Drop the new file in `public/images/` (WebP or JPEG, under ~400 KB). See
 *     the shape the layout expects, below.
 *  2. Point `image` at it — /images/hero-spring.webp, say — and set
 *     `imageWidth` and `imageHeight` to its real pixel size.
 *  3. Rewrite `alt` to describe the new picture. It is read aloud to blind
 *     visitors and shown if the image fails, so describe the scene, not the
 *     brand.
 *  4. Add the path to `componentImages` in `src/__tests__/image-assets.test.ts`
 *     so a 0-byte or missing file fails the build. The homepage has shipped
 *     blank before, from exactly that.
 *
 *  **Give the new file a new name.** Do not overwrite an existing banner in
 *  place: next/image caches optimized output by URL, never by file contents, so
 *  the old picture keeps being served from a path whose bytes have changed. The
 *  banner has already been several different pictures under one name.
 *
 * ── About the text ─────────────────────────────────────────────────────────
 * Each string is written per language. `bg` is what Bulgarian visitors see,
 * `en` what English visitors see. Both are required — a missing one shows the
 * wrong language rather than nothing.
 *
 * These five strings deliberately live here rather than in `messages/bg.json`
 * and `messages/en.json` with the rest of the site's copy. The trade-off is
 * intentional: banner text changes often and changes together with the image,
 * so it is worth keeping in one place with it. If you would rather have it back
 * alongside the other copy, move these into a `homeBanner` namespace in both
 * catalogues and read them with `useTranslations` in `Hero.tsx`.
 *
 * ── Readability: the picture is the only thing holding the text up ─────────
 * On a desktop the heading, subheading and button sit **on the left of the
 * photograph, level with its middle**, with **nothing behind them** — no panel, no
 * veil, no glow. The owner asked for exactly that, and it means legibility is a
 * property of the *picture*, not of the layout. Nothing in `Hero.tsx` can rescue a
 * photograph whose left side is busy or dark.
 *
 * On the current photograph it works up to about 2048px and then stops. Measured
 * under the glyphs themselves at ten widths from 1280px to 3840px:
 *
 *  • **1280–2048px** — the heading clears its 3:1 requirement everywhere; 0.1–9.3%
 *    of the subheading's pixels are under 4.5:1, where its second line runs onto the
 *    pink cushion;
 *  • **2560–3840px** — 36–44% of the subheading is under. The band stops growing at
 *    its height ceiling while the crop keeps tightening, so its mid-height lands on
 *    the cushion and the subheading is simply not readable there. The heading is
 *    still fine (2.3% under at worst, at 3840px).
 *
 * Fixing that tail is a photography or cropping decision, not a layout one, which is
 * why it is written here. So, when you swap the banner:
 *
 *  • **give the left third of the frame something calm and light** — a wall, a
 *    curtain, an out-of-focus background — and keep it calm all the way down, not
 *    just at the top. The words occupy roughly 450px of width at the left, centred
 *    vertically;
 *  • **keep the copy short.** Every extra word and every extra line reaches further
 *    down and further right across the picture. The subheading is the fragile one: it
 *    is small text, so it needs 4.5:1 where the heading needs 3:1;
 *  • **do not reach for a scrim.** Three treatments have already been built and
 *    turned down: a veil over the whole photograph (1.0–3.2:1, then 1.54:1 — the
 *    strong ones erase the picture), a `brand-sand` panel behind the words (8.2:1, but
 *    it looked like a dialog box on the banner) and a soft edgeless bloom (6.0–7.1:1,
 *    but its haze over the middle of the picture was unwanted). Ask the owner before
 *    trying a fourth.
 *
 * Below 1280px none of this applies — the photo and the words are separate there,
 * the words on flat `brand-sand` at 11.5:1 and 5.8:1 whatever you drop in.
 *
 * ── Composition the layout expects ─────────────────────────────────────────
 * A **landscape photograph**, roughly 3:2 — the current one is 1536×1024 — whose
 * **left side is quiet and pale from top to bottom** and whose subject sits centre or
 * right, for the reason above: the words land on the left at mid-height and nothing is
 * drawn between them and the picture. The current photo is pale curtain down its upper
 * left and a pink cushion below that, which is exactly where its subheading breaks up
 * on a wide monitor.
 *
 * On a phone and a tablet the whole picture is shown at its own proportions, so
 * nothing is lost and nothing is covered. From 1280px up it fills the hero edge to
 * edge and is cropped top and bottom to do it — the band is only ~520px tall, so of
 * the current photo's 1024 rows about 624 survive at 1280px, 522 from 1536px up and
 * 304 on a 4K desktop. `Hero.tsx` holds the measured crop windows and the anchor for
 * each viewport band; read the `object-position` note there before swapping in a
 * photograph whose subject sits somewhere else.
 *
 * Export it at least 1536px wide — ideally 2400px or more. It is drawn at the
 * full viewport width, so 1536 is already being upscaled 1.25× on a 1920px
 * monitor.
 */

export interface BannerText {
  bg: string
  en: string
}

export interface HomeBanner {
  /** Path under `public/`. */
  image: string
  /**
   * The image's real pixel dimensions.
   *
   * They do two jobs, so both must match the file. The browser reserves the
   * right amount of space before the image loads, which stops the page jumping;
   * and below 1280px the hero draws the photograph at exactly this ratio, so
   * wrong numbers mean a stretched or letterboxed picture on every phone.
   */
  imageWidth: number
  imageHeight: number
  /** What the picture shows. Not the brand name, not "banner image". */
  alt: BannerText
  heading: BannerText
  subheading: BannerText
  ctaLabel: BannerText
  /**
   * Where the button goes, without the language prefix — `/products` becomes
   * `/bg/products` or `/en/products` automatically.
   */
  ctaHref: string
}

export const homeBanner: HomeBanner = {
  image: '/images/hero-table-window.webp',
  imageWidth: 1536,
  imageHeight: 1024,

  alt: {
    bg: 'Три свещи в метални кутийки върху дървена маса, зад тях ваза с пампаска трева и тънки свещи, отстрани възглавници и покривка на каре',
    en: 'Three candles in metal tins on a wooden table, with a vase of pampas grass and slim taper candles behind them, cushions to one side and a gingham cloth',
  },

  heading: {
    bg: 'Свещи, които ще ти се прииска да изядеш.',
    en: "Candles you'll wish you could eat.",
  },

  subheading: {
    bg: 'Ръчно излети соеви свещи. Без парафин. Без излишни неща.',
    en: "Hand-poured soy candles. No paraffin. Nothing you don't need.",
  },

  ctaLabel: {
    bg: 'Разгледай колекцията',
    en: 'Shop the collection',
  },

  ctaHref: '/products',
}

/** Picks the copy for a locale, falling back to English for unknown ones. */
export function bannerText(text: BannerText, locale: string): string {
  return locale === 'bg' ? text.bg : text.en
}
