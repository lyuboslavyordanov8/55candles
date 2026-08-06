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
        charcoal: '#2B2B2B',
        // Text tokens are tuned to clear WCAG AA (4.5:1) against every cream
        // background, cream-muted included — it is the darkest and therefore
        // the binding case. The originals failed: ink-ghost 2.56:1,
        // clay 3.76:1, ink-secondary 3.89:1 on cream-muted.
        // Hue and saturation are unchanged; only HSL lightness moved.
        // Guarded by src/__tests__/contrast.test.ts.
        clay: '#7C6346',
        border: '#DDD4C8',
        ink: {
          primary: '#2B2B2B',
          secondary: '#5B534B',
          ghost: '#71655A',
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
        sans: ['var(--font-montserrat)', 'sans-serif'],
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
