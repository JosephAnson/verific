import type {
  DiagnosticMessageAdapter,
  MessageContext,
  ValidationIssue,
} from '@verific/core'
import { describe, expect, it } from 'vitest'
import { changeMessageLanguage as changeI18nextLanguage } from './i18next-form'
import {
  createStrictValidationMessages as createStrictI18nextMessages,
  createValidationI18next,
  i18n as i18nextInstance,
} from './i18next-setup'
import { changeMessageLanguage as changeParaglideLanguage } from './paraglide-form'
import {
  createValidationMessages as createParaglideMessages,
  createStrictValidationMessages as createStrictParaglideMessages,
  messageLocale,
} from './paraglide-setup'
import {
  createValidationMessages as createVueI18nMessages,
  i18n as vueI18n,
} from './vue-i18n-setup'

function issue(identifier = 'invalidEmail'): ValidationIssue {
  const raw = { message: 'Schema fallback', path: ['email'] }
  return {
    raw,
    vendor: 'test',
    message: raw.message,
    localPath: raw.path,
    path: raw.path,
    semantic: { identifier, values: {} },
  }
}

function resolve(adapter: DiagnosticMessageAdapter, identifier = 'invalidEmail'): string {
  const value = issue(identifier)
  const context: MessageContext = {
    issue: value,
    path: value.path,
    identifier,
    values: {},
    messagePrefix: 'forms.signup',
    defaultMessage: value.message,
  }
  const result = adapter.resolve(context)

  if (result.resolved)
    return result.message

  adapter.onMissing?.({
    path: value.path,
    identifier,
    messagePrefix: context.messagePrefix,
    attempts: result.attempts ?? (result.attempt ? [result.attempt] : []),
  })
  return value.message
}

describe('copyable localisation adapter setup', () => {
  it('uses the exported Vue I18n factory and strict missing mode', () => {
    vueI18n.global.locale.value = 'es'
    expect(resolve(createVueI18nMessages('throw'))).toBe('Introduce una dirección de correo válida')
    expect(() => resolve(createVueI18nMessages('throw'), 'unknown')).toThrow('Missing validation message')
  })

  it('uses the exported i18next factory and disposes its listeners', async () => {
    const { messages } = await createValidationI18next()
    i18nextInstance.language = 'en'
    await changeI18nextLanguage()

    expect(i18nextInstance.language).toBe('es')
    expect(resolve(messages)).toBe('Introduce una dirección de correo válida')
    const strictMessages = createStrictI18nextMessages()
    expect(() => resolve(strictMessages, 'unknown')).toThrow('Missing validation message')
    expect(() => strictMessages.dispose()).not.toThrow()
    expect(() => messages.dispose()).not.toThrow()
  })

  it('accepts actual generated Paraglide output and strict missing mode', () => {
    messageLocale.value = 'en'
    changeParaglideLanguage()

    expect(messageLocale.value).toBe('es')
    expect(resolve(createParaglideMessages('throw'))).toBe('Introduce una dirección de correo válida')
    expect(() => resolve(createStrictParaglideMessages(), 'unknown')).toThrow('Missing validation message')
  })
})
