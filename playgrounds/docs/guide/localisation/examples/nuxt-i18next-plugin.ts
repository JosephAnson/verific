// #region nuxt-plugin
import { createVerific } from '@verific/core'
import { i18nextMessages } from '@verific/i18next'
import { createInstance } from 'i18next'
import I18NextVue from 'i18next-vue'

type MessageLocale = 'en' | 'es'

function initialLocale(): MessageLocale {
  const language = import.meta.server
    ? useRequestHeaders(['accept-language'])['accept-language']
    : navigator.language

  return language?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export default defineNuxtPlugin(async (nuxtApp) => {
  const i18n = createInstance()
  await i18n.init({
    fallbackLng: 'en',
    lng: initialLocale(),
    resources: {
      en: { translation: { errors: { invalidEmail: 'Enter a valid email address' } } },
      es: { translation: { errors: { invalidEmail: 'Introduce una dirección de correo válida' } } },
    },
  })

  const messages = i18nextMessages(i18n, {
    fallbackPrefix: 'errors',
  })

  nuxtApp.vueApp.use(I18NextVue, { i18next: i18n })
  nuxtApp.vueApp.use(createVerific({ messages }))

  if (import.meta.server) {
    nuxtApp.hook('app:rendered', () => messages.dispose())
  }
})
// #endregion nuxt-plugin

interface CheckedNuxtApp {
  readonly vueApp: {
    use: (plugin: unknown, ...options: unknown[]) => unknown
  }
  hook: (name: 'app:rendered', callback: () => void) => void
}

declare function defineNuxtPlugin(
  setup: (nuxtApp: CheckedNuxtApp) => void | Promise<void>,
): unknown

declare function useRequestHeaders(
  include: readonly string[],
): Readonly<Record<string, string | undefined>>

declare global {
  interface ImportMeta {
    readonly server: boolean
  }
}
