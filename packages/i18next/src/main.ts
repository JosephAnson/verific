import type { DiagnosticMessageAdapter, MessageContext } from '@verific/core'
import type { CatalogueMessagesOptions } from '@verific/i18n'
import type { i18n as I18nextInstance, TOptions } from 'i18next'
import { createCatalogueMessages } from '@verific/i18n'
import { shallowRef } from 'vue'

export type I18nextMessagesOptions = CatalogueMessagesOptions

export interface I18nextMessageAdapter extends DiagnosticMessageAdapter {
  /** Remove this adapter's i18next listeners. Safe to call repeatedly. */
  readonly dispose: () => void
}

function lookupOptions(context: MessageContext, locale: string): TOptions {
  const values = { ...context.values }
  delete values.count

  const options: TOptions = {
    ...values,
    lngs: [locale],
  }

  if (context.count !== undefined) {
    options.count = context.count
  }

  return options
}

/** Create a Verific message resolver backed by a caller-owned i18next 26 instance. */
export function i18nextMessages(
  i18n: I18nextInstance,
  options: I18nextMessagesOptions = {},
): I18nextMessageAdapter {
  const revision = shallowRef(0)
  const invalidate = (): void => {
    revision.value += 1
  }

  i18n.on('languageChanged', invalidate)
  i18n.on('loaded', invalidate)
  i18n.store.on('added', invalidate)
  i18n.store.on('removed', invalidate)

  const resolver = createCatalogueMessages({
    locales() {
      // Reading the revision makes message resolution reactive to native events.
      void revision.value

      if (i18n.languages?.length > 0) {
        return i18n.languages
      }

      const locale = i18n.resolvedLanguage ?? i18n.language
      return locale ? [locale] : []
    },
    lookup(key, locale, context) {
      const nativeOptions = lookupOptions(context, locale)
      if (!i18n.exists(key, nativeOptions)) {
        return { resolved: false }
      }

      return {
        resolved: true,
        message: String(i18n.t(key, nativeOptions)),
      }
    },
  }, options)

  let disposed = false

  return {
    ...resolver,
    dispose() {
      if (disposed) {
        return
      }
      disposed = true

      i18n.off('languageChanged', invalidate)
      i18n.off('loaded', invalidate)
      i18n.store.off('added', invalidate)
      i18n.store.off('removed', invalidate)
    },
  }
}
