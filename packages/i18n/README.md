# `@verific/i18n`

Catalogue and locale adapters for Verific, with one package version and separate
ESM entry points. Install `@verific/i18n` and the locale runtime your app uses.
The Vue I18n, i18next and Paraglide peers are optional; importing one adapter
does not load the others.

| Import | Factory | Application runtime |
| --- | --- | --- |
| `@verific/i18n` | `createCatalogueMessages` | Your catalogue driver |
| `@verific/i18n/vue-i18n` | `vueI18nMessages` | Vue I18n Composition API |
| `@verific/i18n/i18next` | `i18nextMessages` | i18next instance |
| `@verific/i18n/paraglide` | `paraglideMessages` | Generated Paraglide functions |

```ts
import { vueI18nMessages } from '@verific/i18n/vue-i18n'

const messages = vueI18nMessages(composer)
```

```ts
import { i18nextMessages } from '@verific/i18n/i18next'

const messages = i18nextMessages(i18n)
// Dispose when the adapter owner stops using it.
messages.dispose()
```

```ts
import { paraglideMessages } from '@verific/i18n/paraglide'

const messages = paraglideMessages(generatedMessages, { locale: () => locale.value })
```

See the [localisation guide](https://verific.josephanson.com/guide/localisation)
for complete setup, supported runtime versions, locale ownership and fallback.

The root entry supplies the shared key order, locale fallback and missing-message
policies, and works without a locale framework:

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
