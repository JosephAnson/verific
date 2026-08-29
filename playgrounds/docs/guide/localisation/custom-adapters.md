---
outline: deep
---

# Custom adapters

Use `@verific/i18n` when your locale library can perform an exact key-and-locale lookup but has no first-party adapter. The shared catalogue module supplies key generation, key-first fallback and missing-message diagnostics; your driver keeps locale negotiation and formatting in the locale library.

## Install and connect a driver

```bash
pnpm add @verific/core @verific/i18n vue zod
```

```ts [main.ts]
import { createVerific } from '@verific/core'
import { createCatalogueMessages } from '@verific/i18n'
import { createApp, ref } from 'vue'
import App from './App.vue'

const locale = ref('en')
const catalogues: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  en: { 'errors.invalidEmail': 'Enter a valid email address' },
  es: { 'errors.invalidEmail': 'Introduce una dirección de correo válida' },
} as const

const messages = createCatalogueMessages({
  locales: () => [locale.value, 'en'],
  lookup(key, selectedLocale) {
    const message = catalogues[selectedLocale]?.[key]
    if (message === undefined)
      return { resolved: false }

    return {
      resolved: true,
      message,
    }
  },
}, {
  fallbackPrefix: 'errors',
})

createApp(App)
  .use(createVerific({ messages }))
  .mount('#app')
```

`lookup()` must atomically decide exact existence and return the selected translation. Do not let it silently change locale: `createCatalogueMessages()` owns the [shared key-first order](../localisation#the-shared-message-contract).

## Use the shared options

```ts
const messages = createCatalogueMessages(driver, {
  fallbackPrefix: 'errors',
  missing: 'throw',
  key({ identifier, defaultKeys }) {
    return [`validation.${identifier}`, ...defaultKeys]
  },
})
```

- `fallbackPrefix` adds the shared `{prefix}.{identifier}` candidate.
- `missing` accepts `'silent'`, `'warn'`, `'throw'` or a diagnostic callback.
- `key` replaces the candidate list. Include `defaultKeys` to retain the normal field-specific and shared candidates.

A custom key function is also the place to escape dotted field names or handle symbol path segments. Duplicate keys and locales are removed while preserving their first occurrence.

## Render errors normally

The adapter is configured once; forms only select their prefix and render the destructured controller members:

```ts
const { errorsFor, hasError, validate, validateAt } = useValidation(schema, form, {
  messagePrefix: 'forms.signup',
})
```

Read a Vue ref or computed locale inside `locales()` to update displayed errors without schema revalidation. For SSR, construct the driver and its mutable locale state within the request or application boundary.

If a library cannot provide exact lookup, use a core `MessageResolver` directly and return `undefined` on a miss. See [Message resolution](../reference/messages#messageresolver) for that lower-level contract.
