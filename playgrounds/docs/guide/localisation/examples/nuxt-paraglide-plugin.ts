// #region nuxt-plugin
import { createVerific } from '@verific/core'
import { paraglideMessages } from '@verific/paraglide'
import { errors_invalid_email } from '~/paraglide/messages/errors_invalid_email.js'

type MessageLocale = 'en' | 'es'

function initialLocale(): MessageLocale {
  const language = import.meta.server
    ? useRequestHeaders(['accept-language'])['accept-language']
    : navigator.language

  return language?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export default defineNuxtPlugin((nuxtApp) => {
  const locale = useState<MessageLocale>('message-locale', initialLocale)
  const messages = paraglideMessages({
    'errors.invalidEmail': errors_invalid_email,
  }, {
    fallbackPrefix: 'errors',
    locale: () => locale.value,
  })

  nuxtApp.vueApp.use(createVerific({ messages }))
})
// #endregion nuxt-plugin

interface CheckedNuxtApp {
  readonly vueApp: {
    use: (plugin: unknown, ...options: unknown[]) => unknown
  }
}

interface CheckedRef<Value> {
  value: Value
}

declare function defineNuxtPlugin(
  setup: (nuxtApp: CheckedNuxtApp) => void | Promise<void>,
): unknown

declare function useRequestHeaders(
  include: readonly string[],
): Readonly<Record<string, string | undefined>>

declare function useState<Value>(
  key: string,
  initialise: () => Value,
): CheckedRef<Value>

declare global {
  interface ImportMeta {
    readonly server: boolean
  }
}
