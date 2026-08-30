import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '#app': fileURLToPath(new URL('./packages/nuxt/tests/stubs/nuxt-app.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: [...configDefaults.exclude, 'playgrounds/docs/tests/browser/**'],
    coverage: {
      include: ['packages/*/src/**'],
      exclude: ['packages/core/src/main.ts', ...(configDefaults.coverage.exclude || [])],
      thresholds: {
        'packages/core/src/**': {
          branches: 75,
          functions: 100,
          lines: 90,
          statements: 90,
        },
        'packages/nuxt/src/**': {
          branches: 80,
          functions: 50,
          lines: 75,
          statements: 75,
        },
        'branches': 80,
        'functions': 95,
        'lines': 90,
        'statements': 90,
      },
    },
  },
  define: {
    __DEV__: JSON.stringify(true),
  },
})
