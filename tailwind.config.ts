import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        cream: '#faf6f0',
        espresso: '#2a1f14',
        terracotta: '#c85a2a',
        amber: '#e8a050',
        sage: '#7a9e6a',
        sand: '#eee6da',
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
      },
    },
  },
  plugins: [],
}

export default config
