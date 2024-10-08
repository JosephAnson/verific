import tsconfigPaths from 'vite-tsconfig-paths'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    setupFiles: ['./vitest.setup.ts'],
    environment: 'jsdom',
    globals: true,
    exclude: ['docs/*', ...configDefaults.exclude],
    coverage: {
      exclude: ['**/*/devtools.ts', 'packages/**/dist/**', 'docs/*', ...(configDefaults.coverage.exclude || [])],
    },
  },
  define: {
    __DEV__: JSON.stringify(true),
  },
})
