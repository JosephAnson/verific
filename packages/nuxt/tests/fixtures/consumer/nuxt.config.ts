import process from 'node:process'

const manualPlugin = process.env.VERIFIC_MANUAL === 'true'
const localisation = process.env.VERIFIC_I18N === 'true'
const reverseModuleOrder = process.env.VERIFIC_I18N_FIRST === 'true'
const missing = process.env.VERIFIC_MISSING_WARN === 'true' ? 'warn' : 'silent'
const requestBarrier = process.env.VERIFIC_REQUEST_BARRIER === 'true'

const verificModule: [string, Record<string, unknown>] = ['@verific/nuxt', manualPlugin
  ? { global: false }
  : localisation
    ? { messages: { adapter: 'vue-i18n', fallbackPrefix: 'errors', missing } }
    : {}]
const i18nModule: [string, Record<string, unknown>] = ['@nuxtjs/i18n', {
  parallelPlugin: true,
  vueI18n: './i18n.config.ts',
}]
const modules: Array<string | [string, Record<string, unknown>]> = localisation
  ? reverseModuleOrder
    ? [i18nModule, verificModule]
    : [verificModule, i18nModule]
  : [verificModule]

export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  modules,
  plugins: [
    ...(manualPlugin ? [localisation ? '~/test-plugins/verific-i18n' : '~/test-plugins/verific'] : []),
    ...(requestBarrier ? ['~/test-plugins/request-barrier.server'] : []),
  ],
  hooks: {
    'app:resolve': (app) => {
      const verificPlugins = app.plugins.filter((plugin) => {
        const source = typeof plugin === 'string' ? plugin : plugin.src
        return source.includes('node_modules/@verific/nuxt/dist/runtime/plugin')
          || source.includes('verific.vue-i18n')
          || source.includes('/test-plugins/verific')
      })

      if (verificPlugins.length !== 1) {
        throw new Error(`Expected exactly one Verific runtime plugin, found ${verificPlugins.length}.`)
      }
    },
  },
})
