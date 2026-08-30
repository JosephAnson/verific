import type { ConformanceLookup } from '../../../tests/support/localeAdapterConformance'
import { ref } from 'vue'
import { defineLocaleAdapterConformance } from '../../../tests/support/localeAdapterConformance'
import { vueI18nMessages } from '../src/main'

defineLocaleAdapterConformance({
  name: 'vueI18nMessages',
  localeTopology: 'chain',
  localeChange: 'synchronous',
  create({ locale, fallbackLocales, messages, missing }) {
    const selectedLocale = ref(locale)
    const lookups: ConformanceLookup[] = []
    const catalogue = new Map<string, string>(messages.map(entry => (
      [`${entry.locale}:${entry.key}`, entry.message] as const
    )))
    const composer = {
      locale: selectedLocale,
      fallbackLocale: ref(fallbackLocales),
      isGlobal: true,
      fallbackRoot: true,
      te(key: string, selected?: typeof locale) {
        if (selected === undefined) {
          return false
        }
        lookups.push({ key, locale: selected })
        return catalogue.has(`${selected}:${key}`)
      },
      t(key: string, _values: Record<string, unknown>, options: { locale: typeof locale }) {
        return catalogue.get(`${options.locale}:${key}`) ?? key
      },
    }
    const adapter = vueI18nMessages(composer, { fallbackPrefix: 'errors', missing })

    return {
      adapter,
      lookups: () => lookups,
      selectLocale(nextLocale) {
        selectedLocale.value = nextLocale
      },
    }
  },
})
