# `@verific/i18n`

Framework-neutral catalogue message resolution for Verific. It provides the shared key order, locale fallback and missing-message policies used by first-party localisation adapters.

```ts
import { createCatalogueMessages } from '@verific/i18n'

const messages = createCatalogueMessages({
  locales: () => ['en-GB', 'en'],
  lookup(key, locale, context) {
    const message = catalogue[locale]?.[key]
    return message === undefined
      ? { resolved: false }
      : { resolved: true, message: format(message, context.values, context.count) }
  },
}, {
  fallbackPrefix: 'errors',
})
```

For each issue, the adapter tries the field-specific key in every locale before trying the shared fallback key. Pass `missing: 'throw'` in exercised integration tests to fail on missing catalogue entries, or supply a callback to collect structured diagnostics.
