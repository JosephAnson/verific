// @vitest-environment node

import type { ModuleOptions } from '../src/module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import verificModule from '../src/module'

const kit = vi.hoisted(() => ({
  addImports: vi.fn(),
  addPlugin: vi.fn(),
  addPluginTemplate: vi.fn(),
  tryResolveModule: vi.fn(),
}))

vi.mock('@nuxt/kit', () => ({
  addImports: kit.addImports,
  addPlugin: kit.addPlugin,
  addPluginTemplate: kit.addPluginTemplate,
  createResolver: () => ({ resolve: (path: string) => path }),
  defineNuxtModule: () => ({ with: (definition: unknown) => definition }),
  tryResolveModule: kit.tryResolveModule,
}))

interface PluginTemplate {
  filename: string
  name: string
  order: number
  getContents: () => string
}

interface ModuleDefinition {
  meta: { compatibility: { nuxt: string } }
  defaults: { global: boolean, messages: false }
  setup: (
    options: ModuleOptions,
    nuxt: { options: { build: { transpile: string[] } } },
  ) => Promise<void>
}

const moduleDefinition = verificModule as unknown as ModuleDefinition

describe('nuxt module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    kit.tryResolveModule.mockResolvedValue('/resolved/package.mjs')
  })

  it('defaults to one automatic core plugin and only the supported auto-import', async () => {
    const nuxt = createNuxt()

    expect(moduleDefinition.defaults).toEqual({ global: true, messages: false })
    expect(moduleDefinition.meta.compatibility.nuxt).toBe('>=3.21.0 <5.0.0')

    await moduleDefinition.setup({ global: true, messages: false }, nuxt)

    expect(kit.addPlugin).toHaveBeenCalledWith({
      src: './runtime/plugin',
      name: 'verific:plugin',
      order: 20,
    })
    expect(kit.addPluginTemplate).not.toHaveBeenCalled()
    expect(kit.addImports).toHaveBeenCalledWith({ name: 'useValidation', from: '@verific/core' })
    expect(nuxt.options.build.transpile[0]).toMatch(/src\/runtime$/)
  })

  it('keeps auto-imports but performs no plugin or dependency work in manual mode', async () => {
    await moduleDefinition.setup({ global: false }, createNuxt())

    expect(kit.addPlugin).not.toHaveBeenCalled()
    expect(kit.addPluginTemplate).not.toHaveBeenCalled()
    expect(kit.tryResolveModule).not.toHaveBeenCalled()
    expect(kit.addImports).toHaveBeenCalledWith({ name: 'useValidation', from: '@verific/core' })
  })

  it('rejects message options at runtime when automatic installation is disabled', async () => {
    await expect(moduleDefinition.setup({
      global: false,
      messages: { adapter: 'vue-i18n' },
    } as ModuleOptions, createNuxt())).rejects.toThrow('cannot be combined')

    expect(kit.tryResolveModule).not.toHaveBeenCalled()
  })

  it('serialises static Vue I18n options into an ordered generated plugin', async () => {
    const messages = {
      adapter: 'vue-i18n' as const,
      fallbackPrefix: 'errors',
      missing: 'silent' as const,
    }

    await moduleDefinition.setup({ global: true, messages }, createNuxt())

    expect(kit.tryResolveModule).toHaveBeenNthCalledWith(1, '@verific/vue-i18n', expect.any(String))
    expect(kit.tryResolveModule).toHaveBeenNthCalledWith(2, '@nuxtjs/i18n', expect.any(String))
    expect(kit.addPlugin).not.toHaveBeenCalled()
    expect(kit.addPluginTemplate).toHaveBeenCalledOnce()

    const [template, registration] = kit.addPluginTemplate.mock.calls[0] as [PluginTemplate, { append: boolean }]
    const source = template.getContents()
    expect(template).toMatchObject({
      filename: 'verific.vue-i18n.mjs',
      name: 'verific:plugin',
      order: 20,
    })
    expect(registration).toEqual({ append: true })
    expect(source).toContain('import { vueI18nMessages } from \'@verific/vue-i18n\'')
    expect(source).toContain('name: \'verific:plugin\'')
    expect(source).toContain('order: 20')
    expect(source).toContain('dependsOn: [\'i18n:plugin\']')
    expect(source).toContain('installVueI18nVerific(nuxtApp, {"fallbackPrefix":"errors","missing":"silent"}, vueI18nMessages)')
  })

  it('rejects non-serialisable and unsupported JavaScript message configuration', async () => {
    await expect(moduleDefinition.setup({
      global: true,
      messages: {
        adapter: 'vue-i18n',
        key: () => ['errors.invalid'],
      },
    } as unknown as ModuleOptions, createNuxt())).rejects.toThrow('must be `false` or a serialisable')

    expect(kit.tryResolveModule).not.toHaveBeenCalled()
  })

  it.each([
    null,
    0,
    '',
    [],
    {},
    { adapter: 'other' },
    { adapter: 'vue-i18n', fallbackPrefix: 1 },
    { adapter: 'vue-i18n', missing: 'throw' },
  ])('rejects invalid automatic message configuration: %j', async (messages) => {
    await expect(moduleDefinition.setup({
      global: true,
      messages,
    } as unknown as ModuleOptions, createNuxt())).rejects.toThrow('must be `false` or a serialisable')

    expect(kit.addPlugin).not.toHaveBeenCalled()
    expect(kit.addPluginTemplate).not.toHaveBeenCalled()
    expect(kit.tryResolveModule).not.toHaveBeenCalled()
  })

  it.each([
    ['@verific/vue-i18n', 'Install `@verific/vue-i18n`'],
    ['@nuxtjs/i18n', 'Install and register `@nuxtjs/i18n'],
  ])('reports an actionable missing optional peer for %s', async (missingPackage, expected) => {
    kit.tryResolveModule.mockImplementation((packageName: string) => (
      packageName === missingPackage ? undefined : '/resolved/package.mjs'
    ))

    await expect(moduleDefinition.setup({
      global: true,
      messages: { adapter: 'vue-i18n' },
    }, createNuxt())).rejects.toThrow(expected)
  })
})

function createNuxt() {
  return {
    options: {
      build: {
        transpile: [] as string[],
      },
    },
  }
}
