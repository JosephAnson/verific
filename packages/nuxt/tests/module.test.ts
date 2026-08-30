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

interface ModuleDefinition {
  meta: { compatibility: { nuxt: string } }
  defaults: { global: boolean }
  setup: (
    options: ModuleOptions,
    nuxt: { options: { build: { transpile: string[] } } },
  ) => void
}

const moduleDefinition = verificModule as unknown as ModuleDefinition

describe('nuxt module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to one core plugin and the useValidation auto-import', () => {
    const nuxt = createNuxt()

    expect(moduleDefinition.defaults).toEqual({ global: true })
    expect(moduleDefinition.meta.compatibility.nuxt).toBe('>=3.21.0 <5.0.0')

    moduleDefinition.setup({ global: true }, nuxt)

    expect(kit.addPlugin).toHaveBeenCalledWith({
      src: './runtime/plugin',
      name: 'verific:plugin',
      order: 20,
    })
    expect(kit.addImports).toHaveBeenCalledWith({ name: 'useValidation', from: '@verific/core' })
    expect(nuxt.options.build.transpile[0]).toMatch(/src\/runtime$/)
  })

  it('keeps the auto-import but performs no plugin work in manual mode', () => {
    const nuxt = createNuxt()

    moduleDefinition.setup({ global: false }, nuxt)

    expect(kit.addPlugin).not.toHaveBeenCalled()
    expect(kit.addPluginTemplate).not.toHaveBeenCalled()
    expect(kit.tryResolveModule).not.toHaveBeenCalled()
    expect(kit.addImports).toHaveBeenCalledWith({ name: 'useValidation', from: '@verific/core' })
    expect(nuxt.options.build.transpile).toEqual([])
  })

  it('ignores stale message configuration instead of restoring localisation behaviour', () => {
    const staleOptions = {
      global: true,
      get messages(): never {
        throw new Error('messages must not be read')
      },
    } as unknown as ModuleOptions

    expect(() => moduleDefinition.setup(staleOptions, createNuxt())).not.toThrow()

    expect(kit.addPlugin).toHaveBeenCalledOnce()
    expect(kit.addPluginTemplate).not.toHaveBeenCalled()
    expect(kit.tryResolveModule).not.toHaveBeenCalled()
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
