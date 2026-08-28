import type { MissingMessageMode } from '@verific/i18n'
import type { App } from 'vue'
import { createVerific } from '@verific/core'
import { paraglideMessages } from '@verific/paraglide'
import { ref } from 'vue'
import { errors_invalid_email } from './paraglide/messages/errors_invalid_email.js'

export const messageLocale = ref<'en' | 'es'>('en')

export function createValidationMessages(missing?: MissingMessageMode) {
  return paraglideMessages({
    'errors.invalidEmail': errors_invalid_email,
  }, {
    fallbackPrefix: 'errors',
    locale: () => messageLocale.value,
    missing,
  })
}

// #region strict-missing
export function createStrictValidationMessages() {
  return paraglideMessages({
    'errors.invalidEmail': errors_invalid_email,
  }, {
    fallbackPrefix: 'errors',
    locale: () => messageLocale.value,
    missing: 'throw',
  })
}
// #endregion strict-missing

export function installValidation(app: App) {
  app.use(createVerific({ messages: createValidationMessages() }))
}
