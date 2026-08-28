# `@verific/paraglide`

Use generated Paraglide 2 message functions for Verific validation messages. The adapter accepts only the functions you map, so unused generated messages remain tree-shakeable and schema files stay independent of localisation.

```bash
pnpm add @inlang/paraglide-js @verific/core @verific/paraglide vue
```

```ts
import { createVerific } from '@verific/core'
import { paraglideMessages } from '@verific/paraglide'
import { createApp } from 'vue'
import App from './App.vue'
import { locale } from './locale'
import * as m from './paraglide/messages.js'

const app = createApp(App)
app.use(createVerific({
  messages: paraglideMessages({
    'errors.required': m.errors_required,
    'errors.invalidEmail': m.errors_invalid_email,
  }, {
    locale: () => locale.value,
    fallbackPrefix: 'errors',
  }),
}))
app.mount('#app')
```

The `locale` getter is required. Read a Vue ref or computed value inside it so displayed errors change locale without rerunning validation. Create the locale source and adapter inside each SSR request; do not share either as a mutable module-level singleton.

Generated functions keep their concrete input types. Functions with no inputs and functions with required interpolation inputs can be placed in the same map directly, without wrappers or casts. Verific passes semantic interpolation values as the first argument, adds `count` only when an issue defines one, and passes `{ locale }` as the second argument.

The adapter uses the shared catalogue options from `@verific/i18n`. `fallbackPrefix` supplies global keys after a form-specific key misses, `key` can replace the default candidate order, and `missing` supports `'silent'`, `'warn'`, `'throw'` or a diagnostic callback. Use `missing: 'throw'` in exercised test or build-render paths to catch missing catalogue entries.

Forms consume the configured adapter through normal destructured controller members:

```ts
const { errorsFor, hasError, validate, validateFor } = useValidation(schema, form, {
  messagePrefix: 'forms.signup',
})
```

See the dedicated [Paraglide guide](https://verific.josephanson.com/guide/localisation/paraglide) for a complete accessible form, locale switching, request-safe Nuxt setup and strict missing-key tests.

## Licence

MIT
