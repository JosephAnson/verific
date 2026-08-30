import type { TOptions } from 'i18next'
import type { ConformanceLookup } from '../../../tests/support/localeAdapterConformance'
import { createInstance } from 'i18next'
import {
  defineLocaleAdapterConformance,
  nestedMessagesFor,
} from '../../../tests/support/localeAdapterConformance'
import { i18nextMessages } from '../src/main'

defineLocaleAdapterConformance({
  name: 'i18nextMessages',
  localeTopology: 'chain',
  localeChange: 'asynchronous',
  async create({ locale, fallbackLocales, messages, missing }) {
    const i18n = createInstance()
    await i18n.init({
      fallbackLng: fallbackLocales.length > 0 ? fallbackLocales : false,
      lng: locale,
      resources: {
        en: { translation: nestedMessagesFor(messages, 'en') },
        nl: { translation: nestedMessagesFor(messages, 'nl') },
      },
    })
    const lookups: ConformanceLookup[] = []
    const nativeExists = i18n.exists.bind(i18n)
    i18n.exists = ((key: string | string[], options?: TOptions) => {
      const selectedLocale = options?.lngs?.[0]
      if (selectedLocale === 'en' || selectedLocale === 'nl') {
        lookups.push({ key: String(key), locale: selectedLocale })
      }
      return nativeExists(key, options)
    }) as typeof i18n.exists
    const adapter = i18nextMessages(i18n, { fallbackPrefix: 'errors', missing })

    return {
      adapter,
      lookups: () => lookups,
      async selectLocale(nextLocale) {
        await i18n.changeLanguage(nextLocale)
      },
      dispose: adapter.dispose,
    }
  },
})
