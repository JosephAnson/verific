import type { MessageContext, MessageResolver, Verific } from '@verific/core'
import type { VueI18nRuntimeOptions } from '../src/runtime/install'
import { useValidation } from '@verific/core'
import { vueI18nMessages } from '@verific/vue-i18n'
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
import { createI18n } from 'vue-i18n'
import { installVueI18nVerific } from '../src/runtime/install'
import verificPlugin from '../src/runtime/plugin'

interface RuntimePlugin {
  name: string
  order: number
  setup: (nuxtApp: NuxtAppStub) => void
}

interface NuxtAppStub {
  vueApp: { use: ReturnType<typeof vi.fn> }
  $i18n?: unknown
}

describe('nuxt runtime plugin', () => {
  it('installs one unconfigured Verific instance with numeric ordering', () => {
    const nuxtApp = createNuxtApp()
    const plugin = verificPlugin as unknown as RuntimePlugin

    plugin.setup(nuxtApp)

    expect(plugin).toMatchObject({ name: 'verific:plugin', order: 20 })
    expect(nuxtApp.vueApp.use).toHaveBeenCalledOnce()
    expect(installedVerific(nuxtApp).options).toEqual({})
  })

  it('creates request-local adapters for distinct Nuxt application objects', () => {
    const first = createNuxtApp(composer('en'))
    const second = createNuxtApp(composer('nl'))
    const factory = vi.fn((current: ReturnType<typeof composer>, options: VueI18nRuntimeOptions): MessageResolver =>
      () => `${current.locale.value}:${options.fallbackPrefix}`)

    installVueI18nVerific(first, { fallbackPrefix: 'errors' }, factory)
    installVueI18nVerific(second, { fallbackPrefix: 'fouten' }, factory)

    const firstResolver = installedVerific(first).options.messages as MessageResolver
    const secondResolver = installedVerific(second).options.messages as MessageResolver
    expect(factory).toHaveBeenNthCalledWith(1, first.$i18n, { fallbackPrefix: 'errors' })
    expect(factory).toHaveBeenNthCalledWith(2, second.$i18n, { fallbackPrefix: 'fouten' })
    expect(firstResolver).not.toBe(secondResolver)
    expect((firstResolver as (context: MessageContext) => string)(messageContext())).toBe('en:errors')
    expect((secondResolver as (context: MessageContext) => string)(messageContext())).toBe('nl:fouten')
  })

  it('updates mounted messages on locale change without rerunning the schema', async () => {
    const validate = vi.fn((value: { email: string }) => ({
      issues: [{ message: 'Email is required', path: ['email'] }],
      value,
    }))
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'verific-test',
        validate,
      },
    }
    let validation!: ReturnType<typeof useValidation<typeof schema>>
    const component = defineComponent({
      setup() {
        validation = useValidation(schema, reactive({ email: '' }), {
          messagePrefix: 'forms.client',
        })
        return () => h('p', validation.errorFor('email'))
      },
    })
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: {
        en: { forms: { client: { email: { invalid: 'Enter an email address' } } } },
        nl: { forms: { client: { email: { invalid: 'Vul een e-mailadres in' } } } },
      },
    })
    const vueApp = createApp(component)
    vueApp.use(i18n)
    installVueI18nVerific(
      { vueApp, $i18n: i18n.global },
      {},
      vueI18nMessages,
    )
    const host = document.createElement('div')
    document.body.append(host)
    vueApp.mount(host)

    try {
      await validation.validate()
      await nextTick()
      expect(host.textContent).toBe('Enter an email address')
      expect(validate).toHaveBeenCalledOnce()

      i18n.global.locale.value = 'nl'
      await nextTick()
      expect(host.textContent).toBe('Vul een e-mailadres in')
      expect(validate).toHaveBeenCalledOnce()
    }
    finally {
      vueApp.unmount()
      host.remove()
    }
  })

  it('reports a missing Nuxt I18n integration with the manual alternative', () => {
    expect(() => installVueI18nVerific(
      createNuxtApp(),
      {},
      vi.fn(),
    )).toThrow(/could not find `nuxtApp\.\$i18n`.*@nuxtjs\/i18n.*global: false/)
  })

  it('rejects legacy-mode Vue I18n instances with Composition API guidance', () => {
    const legacy = {
      locale: 'en',
      t: vi.fn(),
      te: vi.fn(),
    }

    expect(() => installVueI18nVerific(
      createNuxtApp(legacy),
      {},
      vi.fn(),
    )).toThrow(/Composition API mode.*legacy: false.*install Verific manually/)
  })
})

function createNuxtApp(i18n?: unknown): NuxtAppStub {
  return {
    vueApp: { use: vi.fn() },
    ...(i18n === undefined ? {} : { $i18n: i18n }),
  }
}

function composer(locale: string) {
  return {
    locale: { value: locale },
    fallbackLocale: { value: 'en' },
    isGlobal: true as const,
    fallbackRoot: true,
    te: vi.fn(() => true),
    t: vi.fn((key: string) => key),
  }
}

function installedVerific(nuxtApp: NuxtAppStub): Verific {
  return nuxtApp.vueApp.use.mock.calls[0]?.[0] as Verific
}

function messageContext(): MessageContext {
  const raw = { message: 'Schema message' }
  const issue = {
    raw,
    vendor: 'test',
    message: raw.message,
    localPath: [],
    path: [],
  }
  return {
    issue,
    path: [],
    identifier: 'invalid',
    values: {},
    defaultMessage: raw.message,
  }
}
