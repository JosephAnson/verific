# `@verific/vue-i18n`

Vue I18n 11 message resolution for [Verific](https://verific.josephanson.com/).

## Install

```bash
pnpm add @verific/core @verific/vue-i18n vue vue-i18n
```

## Start with shared errors

Connect the application-wide Composition API Composer once:

```ts
import { createVerific } from '@verific/core'
import { vueI18nMessages } from '@verific/vue-i18n'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import App from './App.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      errors: {
        required: 'This field is required',
        invalidEmail: 'Enter a valid email address',
      },
    },
  },
})

const app = createApp(App)
app.use(i18n)
app.use(createVerific({
  messages: vueI18nMessages(i18n.global, {
    fallbackPrefix: 'errors',
  }),
}))
app.mount('#app')
```

`errors`, `errorsFor()` and `errorFor()` now return localised strings. If a key is missing, Verific falls back to the original Standard Schema error text.

Add a `messagePrefix` only when a form needs specific wording:

```ts
const { validate, errorsFor } = useValidation(schema, form, {
  messagePrefix: 'forms.signup',
})
```

For `email` and `invalidEmail`, the adapter tries:

1. `forms.signup.email.invalidEmail`
2. `errors.invalidEmail`
3. the schema text

Vue I18n handles locale fallback, interpolation and pluralisation. Locale changes update derived errors without another validation run.

## Options

```ts
vueI18nMessages(composer, {
  fallbackPrefix: 'errors',
  missing: 'warn', // 'warn', 'silent', 'throw', or a callback
  key: context => context.defaultKeys,
})
```

- `fallbackPrefix` adds the shared `{prefix}.{identifier}` candidate.
- `missing` warns by default outside production and is silent by default in production. Use `'throw'` to make exercised missing keys fail tests, or pass a callback to collect structured diagnostics.
- `key` replaces the ordered default candidates. Include `context.defaultKeys` to preserve them.

A component-local Composer is supported when the caller sets `composer.fallbackRoot = false` before creating the adapter. Pass that adapter through a registration's `messages` option; its translations are tried before inherited application messages. Each candidate is checked across the supplied Composer's locale chain before the next candidate, and the selected locale is used explicitly for translation.

Use `missing: 'throw'` in exercised tests and read `errorsFor()` after validation to fail on a missing key. For SSR, obtain the Composer from the current application or request; do not share a mutable Composer between requests. `@verific/nuxt` provides the automatic request-safe path for `@nuxtjs/i18n`.

See the dedicated [Vue I18n guide](https://verific.josephanson.com/guide/localisation/vue-i18n) for a complete accessible form, locale switching, local Composers, missing-key tests and Nuxt guidance. See the [message reference](https://verific.josephanson.com/guide/reference/messages) for the complete contract.

## Licence

MIT
