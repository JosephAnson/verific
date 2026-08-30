import { createVerific } from '@verific/core'
import { vueI18nMessages } from '@verific/vue-i18n'
import { createI18n } from 'vue-i18n'
import createI18nOptions from '~/i18n/i18n.config'

export default defineNuxtPlugin((nuxtApp) => {
  const requestedLocale = useRequestHeaders(['x-verific-locale'])['x-verific-locale']
  const locale = requestedLocale === 'nl' ? 'nl' : 'en'
  const i18n = createI18n(createI18nOptions(locale))
  const missing = useRuntimeConfig().public.verificMissing === 'warn' ? 'warn' : 'silent'

  nuxtApp.vueApp.use(i18n)
  nuxtApp.vueApp.use(createVerific({
    messages: vueI18nMessages(i18n.global, {
      fallbackPrefix: 'errors',
      missing,
    }),
  }))
})
