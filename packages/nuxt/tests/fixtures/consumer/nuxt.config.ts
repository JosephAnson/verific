import process from 'node:process'

const localisation = process.env.VERIFIC_I18N === 'true'
const requestBarrier = process.env.VERIFIC_REQUEST_BARRIER === 'true'

export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  modules: [localisation ? ['@verific/nuxt', { global: false }] : '@verific/nuxt'],
  runtimeConfig: {
    public: {
      verificMissing: process.env.VERIFIC_MISSING_WARN === 'true' ? 'warn' : 'silent',
    },
  },
  plugins: [
    ...(localisation ? ['~/test-plugins/verific-i18n'] : []),
    ...(requestBarrier ? ['~/test-plugins/request-barrier.server'] : []),
  ],
  hooks: {
    'app:resolve': (app) => {
      const verificPlugins = app.plugins.filter((plugin) => {
        const source = typeof plugin === 'string' ? plugin : plugin.src
        return source.includes('node_modules/@verific/nuxt/dist/runtime/plugin')
          || source.includes('/test-plugins/verific')
      })

      if (verificPlugins.length !== 1) {
        throw new Error(`Expected exactly one Verific runtime plugin, found ${verificPlugins.length}.`)
      }
    },
  },
})
