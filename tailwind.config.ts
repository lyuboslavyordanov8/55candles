import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          base: '#F6F1EB',
          surface: '#FAF7F3',
          muted: '#EDE5DC',
        },
        /**
         * The single "instead of black" token. Tune it here and every heading,
         * label and button on the site follows.
         *
         * It is a deep warm cocoa, not a neutral grey and never `#000`. The
         * previous value was `#2B2B2B`, a cold near-black that fought the cream
         * and pastel palette. `ink.primary` is the same colour under the name
         * the ink scale uses; both exist because the codebase reaches for
         * `text-charcoal` in some places and `text-ink-primary` in others.
         *
         * 14.97:1 on white and 11.8:1 or better on every pastel tint below, so
         * it clears AA everywhere by a wide margin.
         */
        charcoal: '#2E2521',
        // Text tokens are tuned to clear WCAG AA (4.5:1) against every cream
        // and pastel background — `pastel.pink` is the darkest of them and is
        // therefore the binding case. Hue and saturation are unchanged from the
        // originals; only HSL lightness moved.
        // Guarded by src/__tests__/contrast.test.ts, which crosses every
        // foreground below against every background below.
        clay: '#7C6346',
        border: '#E6DED4',
        ink: {
          primary: '#2E2521',
          secondary: '#5B534B',
          ghost: '#71655A',
        },
        /**
         * Section backgrounds, sampled from the flat colour bands in the
         * product illustrations and then lightened until every ink token clears
         * 4.5:1 on them.
         *
         * The saturated versions straight off the artwork (`#F4D1E5` pink,
         * `#D3EFFE` blue) fail with `clay` at ~4.05:1, so they are deliberately
         * absent: nothing in this scale may sit behind text unless it is in
         * this table and therefore covered by the contrast test.
         */
        pastel: {
          blush: '#FBEDE4', // sweet orange / espresso martini foreground band
          pink: '#FBEAF3', // strawberry cake
          blue: '#EAF6FE', // electric cherry
          butter: '#FDF3DF', // vanilla egg
          lilac: '#F1ECFA', // espresso martini florals
          sage: '#EDF3EB', // foliage throughout
        },
        /** Page grounds. Sections alternate `paper.white` and a pastel tint. */
        paper: {
          white: '#FFFFFF',
          soft: '#FDFAF6',
        },
        brand: {
          /**
           * The announcement bar and the footer — the two bands that bracket
           * the page. Owner-specified (#f7deb9), and near enough to the sky in
           * the banner illustration (#f9deb9) that the header reads as one
           * continuous field with it.
           *
           * **Darker than the pastel tints, and the difference matters.** Only
           * `ink-primary` (11.48:1) and `ink-secondary` (5.79:1) clear AA on
           * it; `clay` (4.32:1) and `ink-ghost` (4.34:1) do not. It is kept out
           * of the `pastel` scale for exactly that reason — that scale carries
           * a promise that any ink token is safe on it, and this colour cannot
           * keep it. See src/__tests__/contrast.test.ts.
           */
          sand: '#F7DEB9',
        },
        scent: {
          cherry: '#e83a3a',
          orange: '#f07020',
          vanilla: '#c8a040',
          strawberry: '#e8408a',
          espresso: '#4a2a18',
          winter: '#7a9ab8',
        },
      },
      fontFamily: {
        // `sans` is Montserrat: body, buttons, labels, nav, prices.
        // `serif` is Nyght Serif Italic: headings, and nothing else.
        // See src/fonts/index.ts for where these variables come from.
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-display)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
