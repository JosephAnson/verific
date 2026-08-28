import type { MissingMessageMode } from '@verific/i18n'
import type { App } from 'vue'
import { createVerific } from '@verific/core'
import { i18nextMessages } from '@verific/i18next'
import { createInstance } from 'i18next'
import I18NextVue from 'i18next-vue'

export const i18n = createInstance()

export async function createValidationI18next(missing?: MissingMessageMode) {
  if (!i18n.isInitialized) {
    await i18n.init({
      fallbackLng: 'en',
      lng: 'en',
      resources: {
        en: { translation: { errors: { invalidEmail: 'Enter a valid email address' } } },
        es: { translation: { errors: { invalidEmail: 'Introduce una dirección de correo válida' } } },
      },
    })
  }

  const messages = i18nextMessages(i18n, {
    fallbackPrefix: 'errors',
    missing,
  })

  return { i18n, messages }
}

// #region strict-missing
export function createStrictValidationMessages() {
  return i18nextMessages(i18n, {
    fallbackPrefix: 'errors',
    missing: 'throw',
  })
}
// #endregion strict-missing

export async function installValidation(app: App) {
  const { i18n, messages } = await createValidationI18next()
  app.use(I18NextVue, { i18next: i18n })
  app.use(createVerific({ messages }))

  return messages.dispose
}
