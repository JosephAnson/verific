export default defineI18nConfig(() => ({
  legacy: false,
  locale: 'en',
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
}))
