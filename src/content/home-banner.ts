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
 * ── Readability ────────────────────────────────────────────────────────────
 * The hero can lay a soft cream scrim over the image so dark text stays legible
 * on whatever you drop in. The current banner is a flat sand field behind the
 * words and needs none, so it is switched off — a dark or busy photo will need
 * `scrimStrength` raised. See the note on that field.
 *
 * ── Composition the layout expects ─────────────────────────────────────────
 * A **wide, short strip** — the current one is 1379×271, about 5:1 — showing
 * its detail along the bottom against a plain sky.
 *
 * The hero draws it as a band across the bottom at its natural proportions,
 * never cropped, and continues the sand behind the text above it. The heading
 * is centred in that sand. So a tall image, or one with its subject in the
 * middle, will not work here: it would be pushed into a band and the text would
 * float above a sliver of it.
 *
 * If you want a full-bleed photograph instead, that is a change to `Hero.tsx`,
 * not to this file — and it will need `scrimStrength` raised to keep the words
 * legible.
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
   * and the hero works out how much room to leave below the text from the
   * ratio between them. Give the wrong numbers and the heading will sit on top
   * of the artwork.
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
  /**
   * How opaque the cream scrim behind the text is, 0–1.
   *
   * 0.9 suits a light illustration. Raise it towards 1 for a darker or busier
   * photograph; lower it if the image is already very pale and the text needs
   * no help. If you ever need to go above ~0.95 to make the words readable, the
   * image is fighting the text — crop it so it has a quiet area on the left
   * instead.
   */
  scrimStrength: number
}

export const homeBanner: HomeBanner = {
  image: '/images/hero.webp',
  imageWidth: 1379,
  imageHeight: 271,

  alt: {
    bg: 'Рисувана илюстрация: тъмночервени хълмове с маргаритки, цветя и облаци под пясъчно небе',
    en: 'Painted illustration of deep red hills with daisies, flowers and clouds beneath a sand-coloured sky',
  },

  heading: {
    bg: 'Свещи, които ще искаш да изядеш.',
    en: "Candles you'll want to eat.",
  },

  subheading: {
    bg: 'Ръчно излети соеви свещи, рисувани като десерт. Без парафин, без токсини.',
    en: 'Hand-poured soy candles, dressed like dessert. No paraffin, no nasties.',
  },

  ctaLabel: {
    bg: 'Разгледай колекцията',
    en: 'Shop the collection',
  },

  ctaHref: '/products',

  // Zero, because the current banner needs no help: its upper half is a flat
  // sand field and the heading sits at 11.5:1 on it unaided. A scrim over a
  // flat colour would only show up as a visible vertical band. Raise it if you
  // swap in a photograph or a busier illustration.
  scrimStrength: 0,
}

/** Picks the copy for a locale, falling back to English for unknown ones. */
export function bannerText(text: BannerText, locale: string): string {
  return locale === 'bg' ? text.bg : text.en
}
