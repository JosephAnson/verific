import type { MissingMessageMode } from '@verific/i18n'
import type { App } from 'vue'
import { createVerific } from '@verific/core'
import { vueI18nMessages } from '@verific/vue-i18n'
import { createI18n } from 'vue-i18n'

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: { errors: { invalidEmail: 'Enter a valid email address' } },
    es: { errors: { invalidEmail: 'Introduce una dirección de correo válida' } },
  },
})

export function createValidationMessages(missing?: MissingMessageMode) {
  return vueI18nMessages(i18n.global, {
    fallbackPrefix: 'errors',
    missing,
  })
}

export function installValidation(app: App) {
  app.use(i18n)
  app.use(createVerific({ messages: createValidationMessages() }))
}
