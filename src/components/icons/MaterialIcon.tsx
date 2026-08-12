/**
 * The icon set: Google Material Symbols (Outlined), inlined as path data.
 *
 * Licensed under the Apache License 2.0, the same terms Google publishes them
 * under: https://github.com/google/material-design-icons
 *
 * **Inlined deliberately — do not swap this for the icon font or a CDN link.**
 * Two reasons. The Content-Security-Policy in `src/lib/security-headers.ts`
 * sets `font-src 'self'` and `default-src 'self'`, so a request to
 * fonts.googleapis.com is blocked and the icons silently vanish. And the cookie
 * policy tells visitors that nothing on this site calls Google — an icon font
 * would quietly make that untrue.
 *
 * To add an icon: take the 24px "Outlined" SVG from
 * fonts.google.com/icons, copy its single `d` attribute here, and keep the
 * `0 -960 960 960` viewBox that Material Symbols uses.
 */

export type IconName =
  | 'menu'
  | 'search'
  | 'close'
  | 'check'
  | 'shoppingBag'
  | 'shoppingBagAdd'
  | 'contentCut'
  | 'flame'
  | 'schedule'
  | 'air'

/**
 * A glyph: either one path, or several when an icon is composed from more than
 * one Material symbol.
 */
type Glyph = string | ReadonlyArray<{ d: string; transform?: string }>

const PATHS: Record<IconName, Glyph> = {
  menu: 'M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z',

  search:
    'M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z',

  close:
    'm256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z',

  check: 'M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z',

  shoppingBag:
    'M240-80q-33 0-56.5-23.5T160-160v-480q0-33 23.5-56.5T240-720h80q0-66 47-113t113-47q66 0 113 47t47 113h80q33 0 56.5 23.5T800-640v480q0 33-23.5 56.5T720-80H240Zm0-80h480v-480h-80v80q0 17-11.5 28.5T600-520q-17 0-28.5-11.5T560-560v-80H400v80q0 17-11.5 28.5T360-520q-17 0-28.5-11.5T320-560v-80h-80v480Zm160-560h160q0-33-23.5-56.5T480-800q-33 0-56.5 23.5T400-720ZM240-160v-480 480Z',

  /**
   * A shopping bag with a plus — "add to cart" as one small control.
   *
   * Composed rather than fetched: Material Symbols has no bag-with-plus glyph
   * (`add_shopping_cart` is a *trolley* with a plus, which would not match the
   * bag in the header). So the bag is scaled down and shifted up-left to clear
   * a corner, and a plus is drawn into the space that opens up.
   *
   * The plus is deliberately large — about 36% of the box. Tucking a small one
   * against the bag's outline is the obvious composition and it fails: at the
   * 20px this renders at, a proportionally-scaled plus is under 3px and
   * disappears.
   */
  /**
   * Shopping bag with the plus *inside* it.
   *
   * It used to be a shrunken bag (scaled 0.72 and shifted up-left) with a
   * separate plus tucked into the bottom-right corner outside it. That read as
   * two competing marks and wasted the glyph's box making room for them, so
   * the bag sat small. The bag is now full size and the plus is centred in its
   * body — one mark, and larger for the same footprint.
   *
   * The bag outline leaves an interior of roughly x 240-720, y -640 to -160.
   * The plus below spans x 400-560, y -480 to -320: centred, and clear of the
   * two handle notches at y ≈ -560.
   */
  shoppingBagAdd: [
    {
      d: 'M240-80q-33 0-56.5-23.5T160-160v-480q0-33 23.5-56.5T240-720h80q0-66 47-113t113-47q66 0 113 47t47 113h80q33 0 56.5 23.5T800-640v480q0 33-23.5 56.5T720-80H240Zm0-80h480v-480h-80v80q0 17-11.5 28.5T600-520q-17 0-28.5-11.5T560-560v-80H400v80q0 17-11.5 28.5T360-520q-17 0-28.5-11.5T320-560v-80h-80v480Zm160-560h160q0-33-23.5-56.5T480-800q-33 0-56.5 23.5T400-720ZM240-160v-480 480Z',
    },
    { d: 'M452-480h56v52h52v56h-52v52h-56v-52h-52v-56h52z' },
  ],

  // content_cut — trimming the wick
  contentCut:
    'M760-120 480-400l-94 94q8 15 11 32t3 34q0 66-47 113T240-80q-66 0-113-47T80-240q0-66 47-113t113-47q17 0 34 3t32 11l94-94-94-94q-15 8-32 11t-34 3q-66 0-113-47T80-720q0-66 47-113t113-47q66 0 113 47t47 113q0 17-3 34t-11 32l494 494v40H760ZM600-520l-80-80 240-240h120v40L600-520ZM296.5-663.5Q320-687 320-720t-23.5-56.5Q273-800 240-800t-56.5 23.5Q160-753 160-720t23.5 56.5Q207-640 240-640t56.5-23.5ZM494-466q6-6 6-14t-6-14q-6-6-14-6t-14 6q-6 6-6 14t6 14q6 6 14 6t14-6ZM296.5-183.5Q320-207 320-240t-23.5-56.5Q273-320 240-320t-56.5 23.5Q160-273 160-240t23.5 56.5Q207-160 240-160t56.5-23.5Z',

  // local_fire_department — the first burn
  flame:
    'M240-400q0 52 21 98.5t60 81.5q-1-5-1-9v-9q0-32 12-60t35-51l113-111 113 111q23 23 35 51t12 60v9q0 4-1 9 39-35 60-81.5t21-98.5q0-50-18.5-94.5T648-574q-20 13-42 19.5t-45 6.5q-62 0-107.5-41T401-690q-39 33-69 68.5t-50.5 72Q261-513 250.5-475T240-400Zm240 52-57 56q-11 11-17 25t-6 29q0 32 23.5 55t56.5 23q33 0 56.5-23t23.5-55q0-16-6-29.5T537-292l-57-56Zm0-492v132q0 34 23.5 57t57.5 23q18 0 33.5-7.5T622-658l18-22q74 42 117 117t43 163q0 134-93 227T480-80q-134 0-227-93t-93-227q0-129 86.5-245T480-840Z',

  // schedule — the four-hour limit
  schedule:
    'm612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 320q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Z',

  // air — draughts
  air: 'M460-160q-50 0-85-35t-35-85h80q0 17 11.5 28.5T460-240q17 0 28.5-11.5T500-280q0-17-11.5-28.5T460-320H80v-80h380q50 0 85 35t35 85q0 50-35 85t-85 35ZM80-560v-80h540q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43h-80q0-59 40.5-99.5T620-840q59 0 99.5 40.5T760-700q0 59-40.5 99.5T620-560H80Zm660 320v-80q26 0 43-17t17-43q0-26-17-43t-43-17H80v-80h660q59 0 99.5 40.5T880-380q0 59-40.5 99.5T740-240Z',
}

interface Props {
  name: IconName
  className?: string
  /**
   * Accessible name. Provide it when the icon is the only content of a control
   * and nothing else names it; leave it off when adjacent text already does,
   * so screen readers do not announce the same thing twice.
   */
  title?: string
}

export default function MaterialIcon({ name, className = 'h-5 w-5', title }: Props) {
  const glyph = PATHS[name]
  const parts = typeof glyph === 'string' ? [{ d: glyph, transform: undefined }] : glyph

  return (
    <svg
      viewBox="0 -960 960 960"
      className={className}
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {parts.map((part, i) => (
        <path key={i} d={part.d} transform={part.transform} />
      ))}
    </svg>
  )
}
