import type {
  DiagnosticMessageAdapter,
  MessageContext,
  MessageResolver,
  MissingMessageDiagnostic,
  ValidationIssue,
} from '@verific/core'
import type {
  CatalogueMessageDriver,
  CatalogueMissingMessageDiagnostic,
} from '../src/main'
import { createVerific, useValidation } from '@verific/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, ref } from 'vue'
import {
  createCatalogueMessages,
} from '../src/main'

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

function diagnostic(value: ValidationIssue, attempts: MissingMessageDiagnostic['attempts']): MissingMessageDiagnostic {
  return {
    messagePrefix: 'forms.signup',
    path: value.path,
    identifier: value.semantic?.identifier ?? 'invalid',
    attempts,
  }
}

function missingDriver(locales: readonly string[] = ['en']): CatalogueMessageDriver {
  return {
    locales: () => locales,
    lookup: () => ({ resolved: false }),
  }
}

async function resolveThroughValidation(
  local: MessageResolver,
  application: MessageResolver,
): Promise<string | undefined> {
  const schema = {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      validate: () => ({ issues: [{ message: 'Schema message', path: ['email'] }] }),
    },
  }
  let validation: ReturnType<typeof useValidation<typeof schema>> | undefined
  const app = createApp(defineComponent({
    setup() {
      validation = useValidation(schema, ref({}), {
        messagePrefix: 'forms.signup',
        messages: local,
      })
      return () => h('div')
    },
  }))
  app.use(createVerific({ messages: application }))
  app.mount(document.createElement('div'))

  try {
    await validation?.validate()
    return validation?.errors.value[0]
  }
  finally {
    app.unmount()
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('createCatalogueMessages', () => {
  it('resolves field keys before global keys across the complete locale chain', () => {
    const lookup = vi.fn((key: string, locale: string) => {
      const messages: Readonly<Record<string, string>> = {
        'fr:errors.invalidEmail': 'Erreur globale',
        'en:forms.signup.email.invalidEmail': 'Use a valid email',
      }
      const message = messages[`${locale}:${key}`]
      return message === undefined
        ? { resolved: false as const }
        : { resolved: true as const, message }
    })
    const adapter = createCatalogueMessages({ locales: () => ['fr', 'en'], lookup }, {
      fallbackPrefix: 'errors',
    })

    expect(adapter.resolve(context(issue()))).toEqual({
      resolved: true,
      message: 'Use a valid email',
    })
    expect(lookup.mock.calls.map(([key, locale]) => [key, locale])).toEqual([
      ['forms.signup.email.invalidEmail', 'fr'],
      ['forms.signup.email.invalidEmail', 'en'],
    ])
  })

  it('returns every miss in key-first order and removes duplicate keys and locales', () => {
    const adapter = createCatalogueMessages(missingDriver(['en', 'nl', 'en']), {
      fallbackPrefix: 'errors',
      key: ({ defaultKeys }) => [defaultKeys[0]!, defaultKeys[0]!, defaultKeys[1]!],
      missing: 'silent',
    })

    expect(adapter.resolve(context(issue()))).toEqual({
      resolved: false,
      attempts: [
        { locale: 'en', keys: ['forms.signup.email.invalidEmail'] },
        { locale: 'nl', keys: ['forms.signup.email.invalidEmail'] },
        { locale: 'en', keys: ['errors.invalidEmail'] },
        { locale: 'nl', keys: ['errors.invalidEmail'] },
      ],
    })
  })

  it('lets a custom key builder replace defaults and exposes them for explicit reuse', () => {
    const key = vi.fn(() => ['account.invalidEmail'])
    const lookup = vi.fn((candidate: string) => candidate === 'account.invalidEmail'
      ? { resolved: true as const, message: 'Account message' }
      : { resolved: false as const })
    const adapter = createCatalogueMessages({ locales: () => ['en'], lookup }, {
      fallbackPrefix: 'errors',
      key,
    })
    const value = issue(['contacts', 0, 'email'])

    expect(adapter.resolve(context(value))).toEqual({ resolved: true, message: 'Account message' })
    expect(key).toHaveBeenCalledWith(expect.objectContaining({
      fallbackPrefix: 'errors',
      defaultKeys: [
        'forms.signup.contacts.0.email.invalidEmail',
        'errors.invalidEmail',
      ],
    }))
    expect(lookup).toHaveBeenCalledOnce()
  })

  it('passes interpolation values and an explicit zero count to the atomic lookup', () => {
    const lookup = vi.fn((_key: string, _locale: string, lookupContext: MessageContext) => ({
      resolved: true as const,
      message: `${lookupContext.values.minimum}:${lookupContext.count}`,
    }))
    const adapter = createCatalogueMessages({ locales: () => ['en'], lookup })
    const value = issue(['name'], 'minLength', { minimum: 3 }, 0)

    expect(adapter.resolve(context(value))).toEqual({ resolved: true, message: '3:0' })
    expect(lookup).toHaveBeenCalledWith(
      'forms.signup.name.minLength',
      'en',
      expect.objectContaining({ values: { minimum: 3 }, count: 0 }),
    )
  })

  it('preserves empty translations as successful resolutions', () => {
    const adapter = createCatalogueMessages({
      locales: () => ['en'],
      lookup: () => ({ resolved: true, message: '' }),
    })

    expect(adapter.resolve(context(issue()))).toEqual({ resolved: true, message: '' })
  })

  it('supports root paths and suppresses only unsupported path-derived keys', () => {
    const root = createCatalogueMessages(missingDriver(), { missing: 'silent' })
    const symbolic = createCatalogueMessages(missingDriver(), {
      fallbackPrefix: 'errors',
      missing: 'silent',
    })

    expect(root.resolve(context(issue([], 'invalid')))).toEqual({
      resolved: false,
      attempts: [{ locale: 'en', keys: ['forms.signup.invalid'] }],
    })
    expect(symbolic.resolve(context(issue([Symbol('field')])))).toEqual({
      resolved: false,
      attempts: [{ locale: 'en', keys: ['errors.invalidEmail'] }],
    })
  })

  it('reports locale-less attempts when keys exist and skips only when no keys exist', () => {
    const noKeys = createCatalogueMessages(missingDriver(), { missing: 'silent' })
    const noLocales = createCatalogueMessages(missingDriver([]), {
      fallbackPrefix: 'errors',
      missing: 'silent',
    })

    expect(noKeys.resolve({ ...context(issue()), messagePrefix: undefined })).toEqual({ resolved: false })
    expect(noLocales.resolve(context(issue()))).toEqual({
      resolved: false,
      attempts: [
        { keys: ['forms.signup.email.invalidEmail'] },
        { keys: ['errors.invalidEmail'] },
      ],
    })

    const strict = createCatalogueMessages(missingDriver([]), {
      fallbackPrefix: 'errors',
      missing: 'throw',
    })
    const result = strict.resolve(context(issue()))
    expect(result.resolved).toBe(false)
    if (!result.resolved) {
      expect(() => strict.onMissing?.({
        messagePrefix: 'forms.signup',
        path: ['email'],
        identifier: 'invalidEmail',
        attempts: result.attempts ?? [],
      })).toThrow(/unknown locale:forms\.signup\.email\.invalidEmail/)
    }
  })

  it('supports silent, warning, throwing and structured callback policies', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const value = issue()
    const attempts = [{ locale: 'en', keys: ['errors.invalidEmail'] }]
    const callback = vi.fn<(value: CatalogueMissingMessageDiagnostic) => void>()

    createCatalogueMessages(missingDriver(), { missing: 'silent' }).onMissing?.(diagnostic(value, attempts))
    expect(warn).not.toHaveBeenCalled()

    createCatalogueMessages(missingDriver(), { missing: 'warn' }).onMissing?.(diagnostic(value, attempts))
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/invalidEmail.*email.*en:errors\.invalidEmail/))

    const strict = createCatalogueMessages(missingDriver(), { missing: 'throw' })
    expect(() => strict.onMissing?.(diagnostic(value, attempts))).toThrow(/invalidEmail.*en:errors\.invalidEmail/)

    createCatalogueMessages(missingDriver(), {
      fallbackPrefix: 'errors',
      missing: callback,
    }).onMissing?.(diagnostic(value, attempts))
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      fallbackPrefix: 'errors',
      messagePrefix: 'forms.signup',
      identifier: 'invalidEmail',
      path: ['email'],
      attempts,
    }))
  })

  it('uses warning outside production and silence in production by default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const value = issue()
    const attempts = [{ locale: 'en', keys: ['errors.invalidEmail'] }]

    vi.stubEnv('NODE_ENV', 'development')
    createCatalogueMessages(missingDriver()).onMissing?.(diagnostic(value, attempts))
    expect(warn).toHaveBeenCalledOnce()

    vi.stubEnv('NODE_ENV', 'production')
    createCatalogueMessages(missingDriver()).onMissing?.(diagnostic(value, attempts))
    expect(warn).toHaveBeenCalledOnce()
  })

  it('does not report misses when a later resolver succeeds', async () => {
    const missing = vi.fn<(value: CatalogueMissingMessageDiagnostic) => void>()
    const adapter = createCatalogueMessages(missingDriver(), {
      fallbackPrefix: 'errors',
      missing,
    })

    expect(await resolveThroughValidation(adapter, () => 'Resolved later')).toBe('Resolved later')
    expect(missing).not.toHaveBeenCalled()
  })

  it('flattens chained adapter attempts under only the first missing owner', async () => {
    const firstMissing = vi.fn<(value: CatalogueMissingMessageDiagnostic) => void>()
    const secondMissing = vi.fn<(value: CatalogueMissingMessageDiagnostic) => void>()
    const first = createCatalogueMessages(missingDriver(['en']), {
      key: () => ['shared.invalid'],
      missing: firstMissing,
    })
    const second = createCatalogueMessages(missingDriver(['en']), {
      key: () => ['shared.invalid'],
      missing: secondMissing,
    })

    expect(await resolveThroughValidation(first, second)).toBe('Schema message')
    expect(firstMissing).toHaveBeenCalledWith(expect.objectContaining({
      attempts: [
        { locale: 'en', keys: ['shared.invalid'] },
        { locale: 'en', keys: ['shared.invalid'] },
      ],
    }))
    expect(secondMissing).not.toHaveBeenCalled()
  })

  it('deduplicates exact locale-key pairs per instance', () => {
    const firstMissing = vi.fn<(value: CatalogueMissingMessageDiagnostic) => void>()
    const secondMissing = vi.fn<(value: CatalogueMissingMessageDiagnostic) => void>()
    const attempts = [{ locale: 'en', keys: ['errors.invalidEmail'] }]
    const value = issue()
    const first = createCatalogueMessages(missingDriver(), { missing: firstMissing })
    const second = createCatalogueMessages(missingDriver(), { missing: secondMissing })

    first.onMissing?.(diagnostic(value, attempts))
    first.onMissing?.(diagnostic(value, attempts))
    second.onMissing?.(diagnostic(value, attempts))

    expect(firstMissing).toHaveBeenCalledOnce()
    expect(secondMissing).toHaveBeenCalledOnce()
  })

  it('bounds deduplication with FIFO eviction', () => {
    const missing = vi.fn<(value: CatalogueMissingMessageDiagnostic) => void>()
    const adapter = createCatalogueMessages(missingDriver(), { missing })
    const value = issue()

    for (let index = 0; index <= 100; index += 1) {
      adapter.onMissing?.(diagnostic(value, [{ locale: 'en', keys: [`errors.invalid${index}`] }]))
    }
    adapter.onMissing?.(diagnostic(value, [{ locale: 'en', keys: ['errors.invalid0'] }]))

    expect(missing).toHaveBeenCalledTimes(102)
  })

  it('surfaces callback failures unchanged', () => {
    const failure = new Error('Collector failed')
    const adapter: DiagnosticMessageAdapter = createCatalogueMessages(missingDriver(), {
      missing: () => { throw failure },
    })

    expect(() => adapter.onMissing?.(diagnostic(issue(), [
      { locale: 'en', keys: ['errors.invalidEmail'] },
    ]))).toThrow(failure)
  })
})
