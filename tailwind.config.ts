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
        clay: '#8B6F4E',
        border: '#DDD4C8',
        ink: {
          primary: '#2B2B2B',
          secondary: '#7A7065',
          ghost: '#9B8E82',
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
