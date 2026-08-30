import type { ConformanceLookup } from '../../../tests/support/localeAdapterConformance'
import { ref } from 'vue'
import { defineLocaleAdapterConformance } from '../../../tests/support/localeAdapterConformance'
import { createCatalogueMessages } from '../src/main'

defineLocaleAdapterConformance({
  name: 'createCatalogueMessages',
  localeTopology: 'chain',
  localeChange: 'synchronous',
  create({ locale, fallbackLocales, messages, missing }) {
    const selectedLocale = ref(locale)
    const lookups: ConformanceLookup[] = []
    const catalogue = new Map<string, string>(messages.map(entry => (
      [`${entry.locale}:${entry.key}`, entry.message] as const
    )))
    const adapter = createCatalogueMessages({
      locales: () => [selectedLocale.value, ...fallbackLocales],
      lookup(key, selected) {
        if (selected !== 'en' && selected !== 'nl') {
          return { resolved: false }
        }

        lookups.push({ key, locale: selected })
        const message = catalogue.get(`${selected}:${key}`)
        return message === undefined
          ? { resolved: false }
          : { resolved: true, message }
      },
    }, { fallbackPrefix: 'errors', missing })

    return {
      adapter,
      lookups: () => lookups,
      selectLocale(nextLocale) {
        selectedLocale.value = nextLocale
      },
    }
  },
})
