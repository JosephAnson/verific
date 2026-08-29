import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@verific/core': fileURLToPath(new URL('../../packages/core/src/main.ts', import.meta.url)),
      '@verific/i18n': fileURLToPath(new URL('../../packages/i18n/src/main.ts', import.meta.url)),
      '@verific/i18next': fileURLToPath(new URL('../../packages/i18next/src/main.ts', import.meta.url)),
      '@verific/paraglide': fileURLToPath(new URL('../../packages/paraglide/src/main.ts', import.meta.url)),
      '@verific/vue-i18n': fileURLToPath(new URL('../../packages/vue-i18n/src/main.ts', import.meta.url)),
    },
    dedupe: ['vue'],
  },
  test: {
    environment: 'jsdom',
    clearMocks: true,
    include: ['.vitepress/examples/*.check.ts'],
  },
})
