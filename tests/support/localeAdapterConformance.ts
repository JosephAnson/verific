import type {
  DiagnosticMessageAdapter,
  MissingMessageDiagnostic,
} from '@verific/core'
import { createVerific, useValidation } from '@verific/core'
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, ref } from 'vue'

export type ConformanceLocale = 'en' | 'nl'

export interface ConformanceMessage {
  readonly locale: ConformanceLocale
  readonly key: string
  readonly message: string
}

export interface ConformanceLookup {
  readonly key: string
  readonly locale: ConformanceLocale
}

export interface LocaleAdapterFixture {
  readonly adapter: DiagnosticMessageAdapter
  readonly lookups: () => readonly ConformanceLookup[]
  readonly selectLocale: (locale: ConformanceLocale) => void | Promise<void>
  readonly dispose?: () => void
}

export interface LocaleAdapterConformanceDriver {
  readonly name: string
  readonly localeTopology: 'chain' | 'single'
  readonly localeChange: 'synchronous' | 'asynchronous'
  readonly create: (options: {
    readonly locale: ConformanceLocale
    readonly fallbackLocales: readonly ConformanceLocale[]
    readonly messages: readonly ConformanceMessage[]
    readonly missing?: (diagnostic: MissingMessageDiagnostic) => void
  }) => LocaleAdapterFixture | Promise<LocaleAdapterFixture>
}

const FIELD_KEY = 'forms.signup.email.invalid'
const GLOBAL_KEY = 'errors.invalid'

function mountValidation(adapter: DiagnosticMessageAdapter) {
  const validateSchema = vi.fn(() => ({
    issues: [{ message: 'Schema message', path: ['email'] }],
  }))
  const schema = {
    '~standard': {
      version: 1 as const,
      vendor: 'conformance',
      validate: validateSchema,
    },
  }
  let validation!: ReturnType<typeof useValidation<typeof schema>>
  const app = createApp(defineComponent({
    setup() {
      validation = useValidation(schema, ref({ email: '' }), {
        describeIssue: () => ({ identifier: 'invalid', values: {} }),
        messagePrefix: 'forms.signup',
        messages: adapter,
      })
      return () => h('div')
    },
  }))
  app.use(createVerific())
  app.mount(document.createElement('div'))

  return {
    validation,
    validateSchema,
    unmount: () => app.unmount(),
  }
}

function expectedAttempts(
  locale: ConformanceLocale,
  fallbackLocales: readonly ConformanceLocale[],
) {
  const locales = [locale, ...fallbackLocales]
  return [FIELD_KEY, GLOBAL_KEY].flatMap(key => (
    locales.map(selectedLocale => ({ locale: selectedLocale, keys: [key] }))
  ))
}

/** Register the common observable contract for one Locale adapter. */
export function defineLocaleAdapterConformance(
  driver: LocaleAdapterConformanceDriver,
): void {
  describe(`${driver.name} Locale adapter conformance`, () => {
    it('resolves keys before locales using exact selected-locale lookups', async () => {
      const locale: ConformanceLocale = 'nl'
      const fallbackLocales: readonly ConformanceLocale[] = driver.localeTopology === 'chain'
        ? ['en']
        : []
      const messages: readonly ConformanceMessage[] = driver.localeTopology === 'chain'
        ? [
            { locale: 'nl', key: GLOBAL_KEY, message: 'Active global message' },
            { locale: 'en', key: FIELD_KEY, message: 'Fallback field message' },
          ]
        : [
            { locale: 'nl', key: FIELD_KEY, message: 'Selected field message' },
            { locale: 'nl', key: GLOBAL_KEY, message: 'Selected global message' },
          ]
      const expectedMessage = driver.localeTopology === 'chain'
        ? 'Fallback field message'
        : 'Selected field message'
      const expectedLookups: readonly ConformanceLookup[] = driver.localeTopology === 'chain'
        ? [
            { key: FIELD_KEY, locale: 'nl' },
            { key: FIELD_KEY, locale: 'en' },
          ]
        : [{ key: FIELD_KEY, locale: 'nl' }]
      const fixture = await driver.create({ locale, fallbackLocales, messages })
      const mounted = mountValidation(fixture.adapter)

      try {
        await mounted.validation.validate()

        expect(mounted.validation.errors.value).toEqual([expectedMessage])
        expect(fixture.lookups()).toEqual(expectedLookups)
        expect(mounted.validateSchema).toHaveBeenCalledOnce()
      }
      finally {
        mounted.unmount()
        fixture.dispose?.()
      }
    })

    it('re-resolves a retained Error immediately when the locale changes', async () => {
      const fixture = await driver.create({
        locale: 'en',
        fallbackLocales: [],
        messages: [
          { locale: 'en', key: GLOBAL_KEY, message: 'English message' },
          { locale: 'nl', key: GLOBAL_KEY, message: 'Nederlands bericht' },
        ],
      })
      const mounted = mountValidation(fixture.adapter)

      try {
        await mounted.validation.validate()
        expect(mounted.validation.errors.value).toEqual(['English message'])

        if (driver.localeChange === 'asynchronous') {
          await fixture.selectLocale('nl')
        }
        else {
          fixture.selectLocale('nl')
        }

        expect(mounted.validation.errors.value).toEqual(['Nederlands bericht'])
        expect(mounted.validateSchema).toHaveBeenCalledOnce()
      }
      finally {
        mounted.unmount()
        fixture.dispose?.()
      }
    })

    it('reports and deduplicates ordered missing diagnostics', async () => {
      const locale: ConformanceLocale = 'en'
      const fallbackLocales: readonly ConformanceLocale[] = driver.localeTopology === 'chain'
        ? ['nl']
        : []
      const missing = vi.fn<(diagnostic: MissingMessageDiagnostic) => void>()
      const fixture = await driver.create({
        locale,
        fallbackLocales,
        messages: [],
        missing,
      })
      const mounted = mountValidation(fixture.adapter)

      try {
        await mounted.validation.validate()

        expect(mounted.validation.errorFor('email')).toBe('Schema message')
        expect(mounted.validation.errorFor('email')).toBe('Schema message')
        expect(missing).toHaveBeenCalledOnce()
        expect(missing).toHaveBeenCalledWith({
          fallbackPrefix: 'errors',
          messagePrefix: 'forms.signup',
          path: ['email'],
          identifier: 'invalid',
          attempts: expectedAttempts(locale, fallbackLocales),
        })
        expect(mounted.validateSchema).toHaveBeenCalledOnce()
      }
      finally {
        mounted.unmount()
        fixture.dispose?.()
      }
    })
  })
}

/** Build one nested catalogue from the shared dot-separated fixture keys. */
export function nestedMessagesFor(
  messages: readonly ConformanceMessage[],
  locale: ConformanceLocale,
): Record<string, unknown> {
  const catalogue: Record<string, unknown> = {}

  for (const entry of messages) {
    if (entry.locale !== locale) {
      continue
    }

    const segments = entry.key.split('.')
    let parent = catalogue

    for (const [index, segment] of segments.entries()) {
      if (index === segments.length - 1) {
        parent[segment] = entry.message
        continue
      }

      const child = parent[segment]
      if (typeof child === 'object' && child !== null) {
        parent = child as Record<string, unknown>
      }
      else {
        const next: Record<string, unknown> = {}
        parent[segment] = next
        parent = next
      }
    }
  }

  return catalogue
}
