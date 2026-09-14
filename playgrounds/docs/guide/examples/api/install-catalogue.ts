import type { App } from 'vue'
import { createVerific } from '@verific/core'
import { createValidationMessages } from './catalogue-messages'

export function installValidation(app: App) {
  const { locale, messages } = createValidationMessages()
  app.use(createVerific({ messages }))
  return { locale }
}
