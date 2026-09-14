---
outline: deep
---

# Custom adapters

Use `@verific/i18n` when your locale library can perform an exact key-and-locale lookup but has no first-party adapter. The shared catalogue module supplies key generation, key-first fallback and missing-message diagnostics; your driver keeps locale negotiation and formatting in the locale library.

## Install and connect a driver

```bash
pnpm add @verific/core @verific/i18n vue zod
```

<<< ../examples/api/catalogue-messages.ts

Install the returned resolver and retain its locale source:

<<< ../examples/api/install-catalogue.ts

Call `installValidation(app)` before mounting. Both displayed files are included in the documentation TypeScript checks.

`lookup()` must atomically decide exact existence and return the selected translation. Do not let it silently change locale: `createCatalogueMessages()` owns the [shared key-first order](../localisation#the-shared-message-contract).

## Use the shared options

Configuration fragment for an existing driver:

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

The adapter is configured once; this registration fragment selects a prefix for an existing schema and model:

```ts
const { errorsFor, hasError, validate } = useValidation(schema, form, {
  messagePrefix: 'forms.signup',
})
```

Read a Vue ref or computed locale inside `locales()` to update displayed errors without schema revalidation. For SSR, construct the driver and its mutable locale state within the request or application boundary.

For a complete native form with direct `validate('email')` on blur, use the [localised form example](./vue-i18n#use-it-in-a-form). Touch remains a separate, optional interaction signal.

See the [`createCatalogueMessages` reference](../reference/catalogue-messages) for exact driver types, defaults, returns and lifetime.

If a library cannot provide exact lookup, use a core `MessageResolver` directly and return `undefined` on a miss. See [Message resolution](../reference/messages#messageresolver) for that lower-level contract.
