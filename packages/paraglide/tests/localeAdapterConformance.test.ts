import type {
  ConformanceLocale,
  ConformanceLookup,
} from '../../../tests/support/localeAdapterConformance'
import { ref } from 'vue'
import { defineLocaleAdapterConformance } from '../../../tests/support/localeAdapterConformance'
import { paraglideMessages } from '../src/main'

type Inputs = Readonly<Record<string, string | number | boolean | null>>
type MessageFunction = (inputs?: Inputs, options?: { locale?: ConformanceLocale }) => string

defineLocaleAdapterConformance({
  name: 'paraglideMessages',
  localeTopology: 'single',
  localeChange: 'synchronous',
  create({ locale, fallbackLocales, messages, missing }) {
    if (fallbackLocales.length > 0) {
      throw new Error('Paraglide conformance fixtures use one explicit locale')
    }

    const selectedLocale = ref(locale)
    const lookups: ConformanceLookup[] = []
    const mapped: Record<string, MessageFunction> = {}
    const keys = new Set(messages.map(entry => entry.key))

    for (const key of keys) {
      mapped[key] = (_inputs, options) => {
        const requestedLocale = options?.locale ?? selectedLocale.value
        lookups.push({ key, locale: requestedLocale })
        return messages.find(entry => (
          entry.key === key && entry.locale === requestedLocale
        ))?.message ?? key
      }
    }

    const adapter = paraglideMessages(mapped, {
      locale: () => selectedLocale.value,
      fallbackPrefix: 'errors',
      missing,
    })

    return {
      adapter,
      lookups: () => lookups,
      selectLocale(nextLocale) {
        selectedLocale.value = nextLocale
      },
    }
  },
})
