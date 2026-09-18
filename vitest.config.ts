import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `import 'server-only'` throws unless it is resolved under the
      // `react-server` condition, which only Next's server build sets. Tests run
      // in jsdom, so any suite that reaches a server module — the checkout action
      // now imports the courier client — would fail on the marker rather than on
      // anything real.
      //
      // Aliased to the package's own no-op entry point rather than adding
      // `react-server` to `resolve.conditions`: that condition is global, and it
      // would swap React itself for its server build, which has no useState and
      // takes every component test with it.
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
})
