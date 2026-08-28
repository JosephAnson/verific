import type { MessageContext, ValidationIssue } from '@verific/core'
import { createInstance } from 'i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'
import { i18nextMessages } from '../src/main'

function issue(
  path: readonly PropertyKey[] = ['email'],
  identifier = 'invalidEmail',
  values: MessageContext['values'] = {},
  count?: number,
): ValidationIssue {
  const raw = { message: 'Schema message', path }
  return {
    raw,
    vendor: 'test',
    message: raw.message,
    localPath: path,
    path,
    semantic: { identifier, values, count },
  }
}

function context(value: ValidationIssue, messagePrefix: string | undefined = 'forms.signup'): MessageContext {
  return {
    issue: value,
    path: value.path,
    identifier: value.semantic?.identifier ?? 'invalid',
    values: value.semantic?.values ?? {},
    count: value.semantic?.count,
    messagePrefix,
    defaultMessage: value.message,
  }
}

async function instance(options: Parameters<ReturnType<typeof createInstance>['init']>[0] = {}) {
  const i18n = createInstance()
  await i18n.init({
    fallbackLng: false,
    lng: 'en',
    resources: {},
    ...options,
  })
  return i18n
}

function resolvedMessage(
  adapter: ReturnType<typeof i18nextMessages>,
  value: ValidationIssue = issue(),
): string | undefined {
  const result = adapter.resolve(context(value))
  return result.resolved ? result.message : undefined
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('i18nextMessages', () => {
  it('reports an actionable miss when the instance has no language yet', async () => {
    const i18n = createInstance()
    await i18n.init({ fallbackLng: false, resources: {} })
    const adapter = i18nextMessages(i18n, {
      fallbackPrefix: 'errors',
      missing: 'throw',
    })

    const result = adapter.resolve(context(issue()))

    expect(result.resolved).toBe(false)
    if (!result.resolved) {
      expect(() => adapter.onMissing?.({
        messagePrefix: 'forms.signup',
        path: ['email'],
        identifier: 'invalidEmail',
        attempts: result.attempts ?? [],
      })).toThrow(/unknown locale:forms\.signup\.email\.invalidEmail/)
    }
    adapter.dispose()
  })

  it('uses key-first lookup across the caller-owned language chain', async () => {
    const i18n = await instance({
      fallbackLng: 'en',
      lng: 'fr',
      resources: {
        en: { translation: { forms: { signup: { email: { invalidEmail: 'Use a valid email' } } } } },
        fr: { translation: { errors: { invalidEmail: 'Adresse incorrecte' } } },
      },
    })
    const adapter = i18nextMessages(i18n, { fallbackPrefix: 'errors' })

    expect(resolvedMessage(adapter)).toBe('Use a valid email')

    adapter.dispose()
  })

  it('passes one identical exact-locale options object to exists and t', async () => {
    const i18n = await instance({
      resources: {
        en: { translation: { forms: { signup: { items: { minimum: '{{minimum}} item' } } } } },
      },
    })
    const exists = vi.spyOn(i18n, 'exists')
    const translate = vi.spyOn(i18n, 't')
    const adapter = i18nextMessages(i18n)
    const value = issue(['items'], 'minimum', { minimum: 3 }, 0)

    expect(resolvedMessage(adapter, value)).toBe('3 item')
    const existsOptions = exists.mock.calls[0]?.[1]
    const translationOptions = translate.mock.calls[0]?.[1]
    expect(existsOptions).toBe(translationOptions)
    expect(existsOptions).toEqual(expect.objectContaining({
      count: 0,
      lngs: ['en'],
      minimum: 3,
    }))

    adapter.dispose()
  })

  it('omits count when the issue has no plural count', async () => {
    const i18n = await instance({
      resources: {
        en: { translation: { forms: { signup: { email: { invalidEmail: 'Invalid' } } } } },
      },
    })
    const exists = vi.spyOn(i18n, 'exists')
    const translate = vi.spyOn(i18n, 't')
    const adapter = i18nextMessages(i18n)
    const value = issue(['email'], 'invalidEmail', { count: 2 })

    expect(resolvedMessage(adapter, value)).toBe('Invalid')
    expect(exists.mock.calls[0]?.[1]).not.toHaveProperty('count')
    expect(translate.mock.calls[0]?.[1]).not.toHaveProperty('count')

    adapter.dispose()
  })

  it('allows configured namespace fallback within the selected locale', async () => {
    const i18n = await instance({
      defaultNS: 'form',
      fallbackNS: 'shared',
      ns: ['form', 'shared'],
      resources: {
        en: {
          form: {},
          shared: { errors: { invalidEmail: 'Shared invalid email' } },
        },
      },
    })
    const adapter = i18nextMessages(i18n, { fallbackPrefix: 'errors' })

    expect(resolvedMessage(adapter)).toBe('Shared invalid email')

    adapter.dispose()
  })

  it('treats a translation whose text equals its key as resolved', async () => {
    const key = 'forms.signup.email.invalidEmail'
    const i18n = await instance({
      resources: { en: { translation: { [key]: key } } },
      keySeparator: false,
    })
    const adapter = i18nextMessages(i18n)

    expect(resolvedMessage(adapter)).toBe(key)

    adapter.dispose()
  })

  it('reacts to language changes without another schema invocation', async () => {
    const i18n = await instance({
      resources: {
        en: { translation: { errors: { invalidEmail: 'English' } } },
        fr: { translation: { errors: { invalidEmail: 'Français' } } },
      },
    })
    const adapter = i18nextMessages(i18n, { fallbackPrefix: 'errors' })
    const message = computed(() => resolvedMessage(adapter))

    expect(message.value).toBe('English')
    await i18n.changeLanguage('fr')
    expect(message.value).toBe('Français')

    adapter.dispose()
  })

  it('reacts when the resource store adds or removes a message', async () => {
    const i18n = await instance()
    const adapter = i18nextMessages(i18n, { fallbackPrefix: 'errors', missing: 'silent' })
    const message = computed(() => resolvedMessage(adapter) ?? 'missing')

    expect(message.value).toBe('missing')
    i18n.addResource('en', 'translation', 'errors.invalidEmail', 'Added')
    expect(message.value).toBe('Added')
    i18n.removeResourceBundle('en', 'translation')
    expect(message.value).toBe('missing')

    adapter.dispose()
  })

  it('invalidates derived messages for loaded events', async () => {
    const i18n = await instance({
      resources: { en: { translation: { errors: { invalidEmail: 'Before' } } } },
    })
    const on = vi.spyOn(i18n, 'on')
    const adapter = i18nextMessages(i18n, { fallbackPrefix: 'errors' })
    const message = computed(() => resolvedMessage(adapter))
    const loaded = on.mock.calls.find(([event]) => event === 'loaded')?.[1]

    expect(message.value).toBe('Before')
    const english = i18n.store.data.en?.translation as Record<string, unknown>
    const errors = english.errors as Record<string, unknown>
    errors.invalidEmail = 'After'
    expect(message.value).toBe('Before')
    loaded?.({ en: { translation: true } })
    expect(message.value).toBe('After')

    adapter.dispose()
  })

  it('attaches exactly four owned listeners and disposes them once', async () => {
    const i18n = await instance()
    const on = vi.spyOn(i18n, 'on')
    const off = vi.spyOn(i18n, 'off')
    const storeOn = vi.spyOn(i18n.store, 'on')
    const storeOff = vi.spyOn(i18n.store, 'off')
    const adapter = i18nextMessages(i18n, { missing: 'silent' })

    expect(on.mock.calls.map(([event]) => event)).toEqual(['languageChanged', 'loaded'])
    expect(storeOn.mock.calls.map(([event]) => event)).toEqual(['added', 'removed'])

    adapter.dispose()
    adapter.dispose()

    expect(off.mock.calls.map(([event]) => event)).toEqual(['languageChanged', 'loaded'])
    expect(storeOff.mock.calls.map(([event]) => event)).toEqual(['added', 'removed'])
    expect(off.mock.calls[0]?.[1]).toBe(on.mock.calls[0]?.[1])
    expect(off.mock.calls[1]?.[1]).toBe(on.mock.calls[1]?.[1])
    expect(storeOff.mock.calls[0]?.[1]).toBe(storeOn.mock.calls[0]?.[1])
    expect(storeOff.mock.calls[1]?.[1]).toBe(storeOn.mock.calls[1]?.[1])
  })

  it('keeps adapters isolated when they share an i18next instance', async () => {
    const i18n = await instance({
      resources: {
        en: { translation: { errors: { invalidEmail: 'English' } } },
        fr: { translation: { errors: { invalidEmail: 'Français' } } },
      },
    })
    const first = i18nextMessages(i18n, { fallbackPrefix: 'errors' })
    const second = i18nextMessages(i18n, { fallbackPrefix: 'errors' })
    const firstMessage = computed(() => resolvedMessage(first))
    const secondMessage = computed(() => resolvedMessage(second))

    expect(firstMessage.value).toBe('English')
    expect(secondMessage.value).toBe('English')
    first.dispose()
    await i18n.changeLanguage('fr')
    expect(firstMessage.value).toBe('English')
    expect(secondMessage.value).toBe('Français')

    second.dispose()
  })

  it('keeps locale state isolated between caller-owned instances', async () => {
    const english = await instance({
      lng: 'en',
      resources: { en: { translation: { errors: { invalidEmail: 'English' } } } },
    })
    const french = await instance({
      lng: 'fr',
      resources: { fr: { translation: { errors: { invalidEmail: 'Français' } } } },
    })
    const englishAdapter = i18nextMessages(english, { fallbackPrefix: 'errors' })
    const frenchAdapter = i18nextMessages(french, { fallbackPrefix: 'errors' })

    expect(resolvedMessage(englishAdapter)).toBe('English')
    expect(resolvedMessage(frenchAdapter)).toBe('Français')

    englishAdapter.dispose()
    frenchAdapter.dispose()
  })
})
