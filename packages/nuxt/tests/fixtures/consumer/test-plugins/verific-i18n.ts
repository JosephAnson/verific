import type { VueI18nComposer } from '@verific/vue-i18n'
import { createVerific } from '@verific/core'
import { vueI18nMessages } from '@verific/vue-i18n'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(createVerific({
    messages: vueI18nMessages(nuxtApp.$i18n as VueI18nComposer, {
      fallbackPrefix: 'errors',
      missing: 'silent',
    }),
  }))
})
