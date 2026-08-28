# `@verific/i18next`

Use a caller-owned i18next 26 instance to localise Verific validation messages. The same instance can also be installed through `i18next-vue`; no separate Vue adapter is needed.

```bash
pnpm add @verific/core @verific/i18next i18next i18next-vue vue
```

```ts
// validation-i18n.ts
import { i18nextMessages } from '@verific/i18next'
import { createInstance } from 'i18next'

export const i18n = createInstance()

await i18n.init({
  fallbackLng: 'en',
  lng: 'en',
  resources: {
    en: {
      translation: {
        errors: {
          required: 'This field is required',
        },
      },
    },
  },
})

export const messages = i18nextMessages(i18n, {
  fallbackPrefix: 'errors',
})
```

```ts
// main.ts — add i18next-vue when the rest of the application uses it
import { createVerific } from '@verific/core'
import I18NextVue from 'i18next-vue'
import { createApp } from 'vue'
import App from './App.vue'
import { i18n, messages } from './validation-i18n'

const app = createApp(App)
app.use(I18NextVue, { i18next: i18n })
app.use(createVerific({ messages }))
app.mount('#app')
```

Supply the same initialised instance to i18next-vue and `i18nextMessages()`.

The adapter reacts to language and resource changes, so committed validation errors update without rerunning the schema. Dispose an application-owned adapter from the root component when that application unmounts:

```vue
<script setup lang="ts">
import { onUnmounted } from 'vue'
import { messages } from './validation-i18n'

onUnmounted(() => messages.dispose())
</script>
```

For SSR, create both the i18next instance and the adapter inside the request scope. Do not share either as a mutable module-level singleton.

Use `missing: 'throw'` in exercised tests to catch missing catalogue entries. Development defaults to warnings and production defaults to silence while retaining the schema message as the final fallback.

Add `messagePrefix: 'forms.signup'` to a form registration for field-specific wording:

```ts
const { errorsFor, hasError, validate, validateFor } = useValidation(schema, form, {
  messagePrefix: 'forms.signup',
})
```

See the dedicated [i18next guide](https://verific.josephanson.com/guide/localisation/i18next) for a complete accessible form, language switching, request-safe Nuxt setup and strict missing-key tests.

## Licence

MIT
