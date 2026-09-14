import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@verific/core': fileURLToPath(new URL('../../../../../packages/core/src/main.ts', import.meta.url)),
      '@verific/i18n/i18next': fileURLToPath(new URL('../../../../../packages/i18n/src/i18next.ts', import.meta.url)),
      '@verific/i18n/paraglide': fileURLToPath(new URL('../../../../../packages/i18n/src/paraglide.ts', import.meta.url)),
      '@verific/i18n/vue-i18n': fileURLToPath(new URL('../../../../../packages/i18n/src/vue-i18n.ts', import.meta.url)),
      '@verific/i18n': fileURLToPath(new URL('../../../../../packages/i18n/src/main.ts', import.meta.url)),
    },
    dedupe: ['vue'],
  },
  test: {
    environment: 'jsdom',
    include: ['guide/localisation/examples/adapters.check.ts'],
  },
})
