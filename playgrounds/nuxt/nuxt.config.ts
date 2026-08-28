export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  modules: [
    '@nuxt/ui',
    '@nuxtjs/i18n',
    '@verific/nuxt',
  ],
  i18n: {
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en-GB', name: 'English' },
      { code: 'es', language: 'es-ES', name: 'Español' },
    ],
    strategy: 'no_prefix',
    vueI18n: './i18n.config.ts',
  },
  verific: {
    messages: {
      adapter: 'vue-i18n',
      fallbackPrefix: 'errors',
      missing: 'warn',
    },
  },
})
