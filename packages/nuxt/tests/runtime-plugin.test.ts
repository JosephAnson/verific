import type { Verific } from '@verific/core'
import { describe, expect, it, vi } from 'vitest'
import verificPlugin from '../src/runtime/plugin'

interface RuntimePlugin {
  name: string
  order: number
  setup: (nuxtApp: NuxtAppStub) => void
}

interface NuxtAppStub {
  vueApp: { use: ReturnType<typeof vi.fn> }
}

describe('nuxt runtime plugin', () => {
  it('installs distinct unconfigured Verific instances for each application', () => {
    const first = createNuxtApp()
    const second = createNuxtApp()
    const plugin = verificPlugin as unknown as RuntimePlugin

    plugin.setup(first)
    plugin.setup(second)

    expect(plugin).toMatchObject({ name: 'verific:plugin', order: 20 })
    expect(first.vueApp.use).toHaveBeenCalledOnce()
    expect(second.vueApp.use).toHaveBeenCalledOnce()
    expect(installedVerific(first)).not.toBe(installedVerific(second))
    expect(installedVerific(first).options).toEqual({})
    expect(installedVerific(second).options).toEqual({})
  })
})

function createNuxtApp(): NuxtAppStub {
  return {
    vueApp: { use: vi.fn() },
  }
}

function installedVerific(nuxtApp: NuxtAppStub): Verific {
  return nuxtApp.vueApp.use.mock.calls[0]?.[0] as Verific
}
