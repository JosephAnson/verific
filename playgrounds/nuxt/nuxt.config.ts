export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  modules: [
    '@nuxt/ui',
    '@verific/nuxt',
  ],
  verific: {
    global: true,
    config: {
      useKeysOverStrings: false,
    },
  },
})
