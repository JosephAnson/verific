import { resolve } from 'node:path'

export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  alias: {
    '@verific/core': resolve(__dirname, '../../packages/core/src/main.ts'),
  },
})
