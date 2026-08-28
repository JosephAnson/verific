import type { DiagnosticMessageAdapter, MessageContext } from '@verific/core'
import type {
  CatalogueKeyContext,
  CatalogueMessagesOptions,
} from '@verific/i18n'
import { createCatalogueMessages } from '@verific/i18n'

interface VueI18nTranslateOptions<Locale extends string> {
  readonly locale: Locale
  readonly plural?: number
}

/** The Vue I18n 11 Composition Composer surface used by the adapter. */
export interface VueI18nComposer<Locale extends string = string> {
  readonly locale: { readonly value: Locale }
  readonly fallbackLocale: { readonly value: unknown }
  readonly isGlobal: boolean
  fallbackRoot: boolean
  te: (key: string, locale?: Locale) => boolean
  t: (
    key: string,
    values: Record<string, unknown>,
    options: VueI18nTranslateOptions<Locale>,
  ) => string
}

export type VueI18nKeyContext = CatalogueKeyContext
export type VueI18nMessagesOptions = CatalogueMessagesOptions

function readComposerValue<T>(value: T | { readonly value: T }): T {
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return value.value
  }

  return value
}

type LocaleBlock = readonly unknown[] | boolean

function appendItemToChain(chain: string[], target: string, blocks: unknown): LocaleBlock {
  if (!target || chain.includes(target.replaceAll('!', ''))) {
    return false
  }

  let follow: LocaleBlock = !target.endsWith('!')
  const locale = target.replaceAll('!', '')
  chain.push(locale)

  if (typeof blocks === 'object' && blocks !== null) {
    const mapped = (blocks as Readonly<Record<string, unknown>>)[locale]
    if (Array.isArray(mapped)) {
      follow = mapped
    }
  }

  return follow
}

function appendLocaleToChain(chain: string[], locale: string, blocks: unknown): LocaleBlock {
  const segments = locale.split('-')
  let follow: LocaleBlock = true

  do {
    follow = appendItemToChain(chain, segments.join('-'), blocks)
    segments.pop()
  } while (segments.length > 0 && follow === true)

  return follow
}

function appendBlockToChain(chain: string[], block: readonly unknown[], blocks: unknown): LocaleBlock {
  let follow: LocaleBlock = true

  for (const locale of block) {
    if (typeof locale === 'string' && typeof follow === 'boolean') {
      follow = appendLocaleToChain(chain, locale, blocks)
    }
  }

  return follow
}

function composerLocaleChain<Locale extends string>(composer: VueI18nComposer<Locale>): readonly string[] {
  const activeLocale = String(readComposerValue(composer.locale))
  const fallback = readComposerValue(composer.fallbackLocale) as unknown
  const chain: string[] = []
  let block: unknown = [activeLocale]

  while (Array.isArray(block)) {
    block = appendBlockToChain(chain, block, fallback)
  }

  const defaults = Array.isArray(fallback) || typeof fallback !== 'object' || fallback === null
    ? fallback
    : (fallback as Readonly<Record<string, unknown>>).default ?? null
  block = typeof defaults === 'string' ? [defaults] : defaults
  if (Array.isArray(block)) {
    appendBlockToChain(chain, block, false)
  }

  return chain
}

function translate<Locale extends string>(
  composer: VueI18nComposer<Locale>,
  key: string,
  locale: Locale,
  context: MessageContext,
): string {
  const options: VueI18nTranslateOptions<Locale> = context.count === undefined
    ? { locale }
    : { locale, plural: context.count }

  return composer.t(key, context.values, options)
}

/** Create a Verific message resolver backed by a caller-owned Vue I18n 11 Composer. */
export function vueI18nMessages<Locale extends string>(
  composer: VueI18nComposer<Locale>,
  options: VueI18nMessagesOptions = {},
): DiagnosticMessageAdapter {
  if (!composer.isGlobal && composer.fallbackRoot !== false) {
    throw new Error(
      '[Verific] A local Vue I18n Composer must use `fallbackRoot: false` so inherited Verific message resolvers retain precedence. Set `composer.fallbackRoot = false` before passing it to `vueI18nMessages`.',
    )
  }

  return createCatalogueMessages({
    locales: () => composerLocaleChain(composer),
    lookup(key, locale, context) {
      if (!composer.te(key, locale as Locale)) {
        return { resolved: false }
      }

      return {
        resolved: true,
        message: translate(composer, key, locale as Locale, context),
      }
    },
  }, options satisfies CatalogueMessagesOptions)
}
