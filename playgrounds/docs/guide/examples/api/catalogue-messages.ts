import { createCatalogueMessages } from '@verific/i18n'
import { ref } from 'vue'

export function createValidationMessages() {
  const locale = ref('en')
  const catalogues: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    en: { 'errors.invalidEmail': 'Enter a valid email address' },
    es: { 'errors.invalidEmail': 'Introduce una dirección de correo válida' },
  }

  const messages = createCatalogueMessages({
    locales: () => [locale.value, 'en'],
    lookup(key, selectedLocale) {
      const message = catalogues[selectedLocale]?.[key]
      return message === undefined
        ? { resolved: false }
        : { resolved: true, message }
    },
  }, {
    fallbackPrefix: 'errors',
  })

  return { locale, messages }
}
