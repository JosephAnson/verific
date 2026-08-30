import type {
  MessageContext,
  MissingMessageDiagnostic,
  ValidationIssue,
} from '@verific/core'
import { createVerific, useValidation } from '@verific/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, ref } from 'vue'
import { createI18n, useI18n } from 'vue-i18n'
import { vueI18nMessages } from '../src/main'

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

function reportMissing(
  adapter: ReturnType<typeof vueI18nMessages>,
  value: ValidationIssue,
  messagePrefix = 'forms.signup',
): void {
  const result = adapter.resolve(context(value, messagePrefix))
  expect(result.resolved).toBe(false)
  if (!result.resolved) {
    adapter.onMissing?.({
      messagePrefix,
      path: value.path,
      identifier: value.semantic?.identifier ?? 'invalid',
      attempts: result.attempts ?? (result.attempt ? [result.attempt] : []),
    })
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('vueI18nMessages', () => {
  it('resolves ordered field and global keys with native interpolation', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: {
        en: {
          forms: { signup: { email: { invalidEmail: 'Use a valid email for {field}' } } },
          errors: { invalidEmail: 'Global invalid email' },
        },
      },
    })
    const adapter = vueI18nMessages(i18n.global, { fallbackPrefix: 'errors' })
    const value = issue(['email'], 'invalidEmail', { field: 'email' })

    expect(adapter.resolve(context(value))).toEqual({
      resolved: true,
      message: 'Use a valid email for email',
    })
  })

  it('uses Composer catalogue fallback and pluralisation', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'nl-BE',
      fallbackLocale: ['en'],
      missingWarn: false,
      fallbackWarn: false,
      messages: {
        'nl-BE': {},
        'en': { errors: { minLength: 'No characters | One character | At least {minimum} characters' } },
      },
    })
    const adapter = vueI18nMessages(i18n.global, { fallbackPrefix: 'errors' })
    const value = issue(['name'], 'minLength', { minimum: 3 }, 3)

    expect(adapter.resolve(context(value))).toEqual({
      resolved: true,
      message: 'At least 3 characters',
    })
  })

  it('translates with the exact selected locale and an explicit zero plural count', () => {
    const t = vi.fn(() => 'No characters')
    const composer = {
      locale: { value: 'fr' as const },
      fallbackLocale: { value: ['en'] },
      isGlobal: true,
      fallbackRoot: true,
      te: (key: string, locale?: 'fr' | 'en') => key === 'errors.minLength' && locale === 'en',
      t,
    }
    const value = issue(['name'], 'minLength', { minimum: 3 }, 0)

    expect(vueI18nMessages(composer, { fallbackPrefix: 'errors' }).resolve(context(value))).toEqual({
      resolved: true,
      message: 'No characters',
    })
    expect(t).toHaveBeenCalledWith('errors.minLength', { minimum: 3 }, { locale: 'en', plural: 0 })
  })

  it('treats a catalogue value equal to its key as resolved', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: { en: { errors: { invalidEmail: 'errors.invalidEmail' } } },
    })
    const missing = vi.fn()
    const adapter = vueI18nMessages(i18n.global, { fallbackPrefix: 'errors', missing })
    const value = issue()

    expect(adapter.resolve(context(value))).toEqual({
      resolved: true,
      message: 'errors.invalidEmail',
    })
    expect(missing).not.toHaveBeenCalled()
  })

  it('accepts a captured component-local Composer after setup', () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })
    let createAdapter: (() => ReturnType<typeof vueI18nMessages>) | undefined
    const component = defineComponent({
      setup() {
        const composer = useI18n({
          useScope: 'local',
          messages: { en: { forms: { profile: { name: { required: 'Enter a name' } } } } },
        })
        composer.fallbackRoot = false
        createAdapter = () => vueI18nMessages(composer)
        return () => h('div')
      },
    })
    const app = createApp(component)
    app.use(i18n)
    app.mount(document.createElement('div'))

    const resolution = createAdapter?.().resolve(context(issue(['name'], 'required'), 'forms.profile'))
    expect(resolution).toEqual({ resolved: true, message: 'Enter a name' })
    app.unmount()
  })

  it('passes resolved defaults to a replacing custom key builder', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: { en: { custom: { invalidEmail: 'Custom message' } } },
    })
    const key = vi.fn(() => ['custom.invalidEmail'])
    const adapter = vueI18nMessages(i18n.global, { fallbackPrefix: 'errors', key })
    const value = issue(['contacts', 0, 'email'])

    expect(adapter.resolve(context(value))).toEqual({ resolved: true, message: 'Custom message' })
    expect(key).toHaveBeenCalledWith(expect.objectContaining({
      fallbackPrefix: 'errors',
      defaultKeys: [
        'forms.signup.contacts.0.email.invalidEmail',
        'errors.invalidEmail',
      ],
    }))
  })

  it('omits only an empty path segment and skips absent prefixes', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: { en: { forms: { signup: { invalid: 'Root message' } } } },
    })
    const value = issue([], 'invalid')

    expect(vueI18nMessages(i18n.global).resolve(context(value))).toEqual({
      resolved: true,
      message: 'Root message',
    })
    expect(vueI18nMessages(i18n.global, { missing: 'silent' }).resolve({
      ...context(value),
      messagePrefix: undefined,
    })).toEqual({
      resolved: false,
    })
  })

  it('skips unsupported default path segments and honours an empty custom key list', () => {
    const symbol = Symbol('field')
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: { en: { errors: { invalidEmail: 'Global message' } } },
    })
    const fallback = vueI18nMessages(i18n.global, { fallbackPrefix: 'errors', missing: 'silent' })
    const skipped = vueI18nMessages(i18n.global, {
      fallbackPrefix: 'errors',
      key: () => [],
      missing: 'silent',
    })
    const value = issue([symbol])

    expect(fallback.resolve(context(value))).toEqual({ resolved: true, message: 'Global message' })
    expect(skipped.resolve(context(value))).toMatchObject({
      resolved: false,
    })
  })

  it('lets the inherited application adapter resolve after a local root-fallback miss', async () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en-GB',
      fallbackLocale: ['de'],
      missingWarn: false,
      fallbackWarn: false,
      messages: {
        'en-GB': {},
        'de': { errors: { invalid: 'Application fallback' } },
      },
    })
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: () => ({ issues: [{ message: 'Schema message', path: ['email'] }] }),
      },
    }
    let localResolution: ReturnType<ReturnType<typeof vueI18nMessages>['resolve']> | undefined
    let validation: ReturnType<typeof useValidation<typeof schema>> | undefined
    const component = defineComponent({
      setup() {
        const composer = useI18n({
          useScope: 'local',
          inheritLocale: false,
          locale: 'fr-CA',
          fallbackLocale: ['nl'],
          missingWarn: false,
          fallbackWarn: false,
          messages: { 'fr-CA': {}, 'nl': {} },
        })
        composer.fallbackRoot = false
        const adapter = vueI18nMessages(composer, { fallbackPrefix: 'errors' })
        localResolution = adapter.resolve(context(issue()))
        validation = useValidation(schema, ref({ email: '' }), { messages: adapter })
        return () => h('div')
      },
    })
    const app = createApp(component)
    app.use(i18n)
    app.use(createVerific({
      messages: vueI18nMessages(i18n.global, { fallbackPrefix: 'errors' }),
    }))
    app.mount(document.createElement('div'))

    expect(localResolution).toEqual({
      resolved: false,
      attempts: [
        { locale: 'fr-CA', keys: ['forms.signup.email.invalidEmail'] },
        { locale: 'fr', keys: ['forms.signup.email.invalidEmail'] },
        { locale: 'nl', keys: ['forms.signup.email.invalidEmail'] },
        { locale: 'fr-CA', keys: ['errors.invalidEmail'] },
        { locale: 'fr', keys: ['errors.invalidEmail'] },
        { locale: 'nl', keys: ['errors.invalidEmail'] },
      ],
    })
    await validation?.validate()
    expect(validation?.errors.value).toEqual(['Application fallback'])
    app.unmount()
  })

  it('does not associate a Composer with another application ambiently', () => {
    const firstI18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: { en: { errors: { invalidEmail: 'First application root' } } },
    })
    let createFirstAdapter: (() => ReturnType<typeof vueI18nMessages>) | undefined
    const firstApp = createApp(defineComponent({
      setup() {
        const composer = useI18n({ useScope: 'local', messages: { en: {} } })
        composer.fallbackRoot = false
        createFirstAdapter = () => vueI18nMessages(composer, { fallbackPrefix: 'errors' })
        return () => h('div')
      },
    }))
    firstApp.use(firstI18n)
    firstApp.mount(document.createElement('div'))

    const secondI18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: { en: { errors: { invalidEmail: 'Second application root' } } },
    })
    let adapterFromFirst: ReturnType<typeof vueI18nMessages> | undefined
    const secondApp = createApp(defineComponent({
      setup() {
        adapterFromFirst = createFirstAdapter?.()
        return () => h('div')
      },
    }))
    secondApp.use(secondI18n)
    secondApp.mount(document.createElement('div'))

    expect(adapterFromFirst?.resolve(context(issue()))).toEqual({
      resolved: false,
      attempts: [
        { locale: 'en', keys: ['forms.signup.email.invalidEmail'] },
        { locale: 'en', keys: ['errors.invalidEmail'] },
      ],
    })
    secondApp.unmount()
    firstApp.unmount()
  })

  it('rejects a local Composer whose root fallback could bypass resolver precedence', () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })
    let createAdapter: (() => ReturnType<typeof vueI18nMessages>) | undefined
    const app = createApp(defineComponent({
      setup() {
        const composer = useI18n({ useScope: 'local', messages: { en: {} } })
        createAdapter = () => vueI18nMessages(composer)
        return () => h('div')
      },
    }))
    app.use(i18n)
    app.mount(document.createElement('div'))

    expect(createAdapter).toBeDefined()
    expect(() => createAdapter?.()).toThrow(/fallbackRoot: false/)
    app.unmount()
  })

  it('does not mutate the supplied Composer', () => {
    let fallbackRootWrites = 0
    const composer = {
      locale: { value: 'en' as const },
      fallbackLocale: { value: false },
      isGlobal: false,
      get fallbackRoot() {
        return false
      },
      set fallbackRoot(_value: boolean) {
        fallbackRootWrites += 1
      },
      te: () => false,
      t: () => 'unreachable',
    }
    const adapter = vueI18nMessages(composer, { fallbackPrefix: 'errors', missing: 'silent' })

    expect(adapter.resolve(context(issue()))).toMatchObject({ resolved: false })
    expect(fallbackRootWrites).toBe(0)
  })

  it('reports structured locale attempts once per adapter and logical key', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'fr-CA',
      fallbackLocale: ['nl', 'en'],
      missingWarn: false,
      fallbackWarn: false,
      messages: { 'fr-CA': {}, 'nl': {}, 'en': {} },
    })
    const missing = vi.fn<(diagnostic: MissingMessageDiagnostic) => void>()
    const adapter = vueI18nMessages(i18n.global, { fallbackPrefix: 'errors', missing })
    const value = issue()

    reportMissing(adapter, value)
    reportMissing(adapter, value)

    expect(missing).toHaveBeenCalledTimes(1)
    expect(missing.mock.calls[0]?.[0].attempts).toEqual([
      { locale: 'fr-CA', keys: ['forms.signup.email.invalidEmail'] },
      { locale: 'fr', keys: ['forms.signup.email.invalidEmail'] },
      { locale: 'nl', keys: ['forms.signup.email.invalidEmail'] },
      { locale: 'en', keys: ['forms.signup.email.invalidEmail'] },
      { locale: 'fr-CA', keys: ['errors.invalidEmail'] },
      { locale: 'fr', keys: ['errors.invalidEmail'] },
      { locale: 'nl', keys: ['errors.invalidEmail'] },
      { locale: 'en', keys: ['errors.invalidEmail'] },
    ])
  })

  it('uses warn by default in development and remains silent by default in production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

    vi.stubEnv('NODE_ENV', 'development')
    reportMissing(vueI18nMessages(i18n.global), issue())
    expect(warn).toHaveBeenCalledTimes(1)

    vi.stubEnv('NODE_ENV', 'production')
    reportMissing(vueI18nMessages(i18n.global), issue())
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('lets an explicit missing policy override the environment default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

    vi.stubEnv('NODE_ENV', 'production')
    reportMissing(vueI18nMessages(i18n.global, { missing: 'warn' }), issue())
    expect(warn).toHaveBeenCalledTimes(1)

    vi.stubEnv('NODE_ENV', 'development')
    reportMissing(vueI18nMessages(i18n.global, { missing: 'silent' }), issue())
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('lets a higher-precedence silent adapter own final missing-message handling', async () => {
    const localI18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })
    const applicationI18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })
    const applicationMissing = vi.fn()
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: () => ({ issues: [{ message: 'Schema message', path: ['email'] }] }),
      },
    }
    let validation: ReturnType<typeof useValidation<typeof schema>> | undefined
    const component = defineComponent({
      setup() {
        validation = useValidation(schema, ref({ email: '' }), {
          messages: vueI18nMessages(localI18n.global, { missing: 'silent' }),
        })
        return () => h('div')
      },
    })
    const app = createApp(component)
    app.use(createVerific({
      messages: vueI18nMessages(applicationI18n.global, { missing: applicationMissing }),
    }))
    app.mount(document.createElement('div'))

    await validation?.validate()
    expect(validation?.errors.value).toEqual(['Schema message'])
    expect(applicationMissing).not.toHaveBeenCalled()
    app.unmount()
  })

  it('allows an explicit missing callback to surface errors', () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })
    const failure = new Error('Missing catalogue entry')
    const adapter = vueI18nMessages(i18n.global, {
      missing: () => {
        throw failure
      },
    })

    expect(() => reportMissing(adapter, issue())).toThrow(failure)
  })

  it('supports strict missing-message enforcement', () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

    expect(() => reportMissing(
      vueI18nMessages(i18n.global, { fallbackPrefix: 'errors', missing: 'throw' }),
      issue(),
    )).toThrow(/invalidEmail.*forms\.signup\.email\.invalidEmail.*errors\.invalidEmail/)
  })
})
