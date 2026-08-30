export default function createI18nOptions(locale: 'en' | 'nl') {
  return {
    legacy: false as const,
    locale,
    fallbackLocale: 'en',
    messages: {
      en: {
        forms: {
          consumer: {
            email: {
              invalid: 'Enter an email address',
            },
          },
        },
      },
      nl: {
        forms: {
          consumer: {
            email: {
              invalid: 'Vul een e-mailadres in',
            },
          },
        },
      },
    },
  }
}
