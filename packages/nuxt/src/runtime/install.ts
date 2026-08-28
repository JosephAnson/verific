import type { MessageResolver } from '@verific/core'
import { createVerific } from '@verific/core'

export interface VueI18nRuntimeOptions {
  readonly fallbackPrefix?: string
  readonly missing?: 'warn' | 'silent'
}

interface CompositionComposer {
  readonly locale: { readonly value: string }
  readonly fallbackLocale: { readonly value: unknown }
  readonly isGlobal: true
  readonly fallbackRoot: boolean
  readonly te: (key: string, locale?: string) => boolean
  readonly t: (key: string, values: Record<string, unknown>, plural?: number) => string
}

interface NuxtAppLike {
  readonly vueApp: {
    use: (plugin: ReturnType<typeof createVerific>) => unknown
  }
  readonly $i18n?: unknown
}

type VueI18nMessageFactory = (
  composer: CompositionComposer,
  options: VueI18nRuntimeOptions,
) => MessageResolver

export function installVerific(nuxtApp: NuxtAppLike): void {
  nuxtApp.vueApp.use(createVerific())
}

export function installVueI18nVerific(
  nuxtApp: NuxtAppLike,
  options: VueI18nRuntimeOptions,
  createMessages: VueI18nMessageFactory,
): void {
  const composer = requireCompositionComposer(nuxtApp.$i18n)
  nuxtApp.vueApp.use(createVerific({ messages: createMessages(composer, options) }))
}

function requireCompositionComposer(value: unknown): CompositionComposer {
  if (value === undefined || value === null) {
    throw new Error(
      '[Verific] Vue I18n message integration could not find `nuxtApp.$i18n`. Install and register `@nuxtjs/i18n >=10.6 <11`, or set `global: false` and install `createVerific({ messages })` from an application plugin.',
    )
  }

  if (!isCompositionComposer(value)) {
    throw new Error(
      '[Verific] Automatic Vue I18n integration requires Composition API mode. Configure `@nuxtjs/i18n` with `vueI18n: { legacy: false }`, or set `global: false` and install Verific manually.',
    )
  }

  return value
}

function isCompositionComposer(value: unknown): value is CompositionComposer {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const composer = value as Record<PropertyKey, unknown>
  return composer.isGlobal === true
    && isRefLike(composer.locale)
    && isRefLike(composer.fallbackLocale)
    && typeof composer.te === 'function'
    && typeof composer.t === 'function'
}

function isRefLike(value: unknown): value is { readonly value: unknown } {
  return typeof value === 'object' && value !== null && 'value' in value
}
