---
outline: deep
---

<script setup>
import I18nextValidationExample from '../../.vitepress/examples/I18nextValidationExample.vue'
</script>

# i18next

`@verific/i18next` uses a caller-owned i18next 26 instance. Install that same instance through i18next-vue when the rest of the application also uses i18next.

## Install and configure the application

```bash
pnpm add @verific/core @verific/i18next i18next i18next-vue vue zod
```

<<< ./examples/i18next-setup.ts

Await `installValidation(app)` before mounting and call its returned disposer
before unmounting. This displayed source is compiled by the documentation test
suite against i18next 26, i18next-vue and the exported adapter.

The instance supplied to i18next-vue and `i18nextMessages()` is deliberately the same. The adapter listens for language, catalogue-load and resource-store changes. `dispose()` removes only its own listeners and is safe to call repeatedly.

## Use it in a form

```vue [SignupForm.vue]
<script setup lang="ts">
import { useValidation } from '@verific/core'
import { reactive } from 'vue'
import { z } from 'zod'
import { i18n } from './i18next-setup'

const form = reactive({ email: '' })
const schema = z.object({ email: z.email() })
const { errorsFor, hasError, state, touch, validate, validateAt } = useValidation(schema, form, {
  messagePrefix: 'forms.signup',
})

async function onEmailBlur() {
  touch('email')
  await validateAt('email')
}

async function submit() {
  const result = await validate()
  if (result.success && state.value.validated && !state.value.stale) {
    // Submit application-owned state.
  }
}
</script>

<template>
  <form novalidate aria-describedby="i18next-required-instructions" @submit.prevent="submit">
    <p id="i18next-required-instructions">
      Email is required.
    </p>
    <label for="email">Email</label>
    <input
      id="email"
      v-model="form.email"
      type="email"
      required
      :aria-invalid="hasError('email')"
      aria-describedby="email-errors"
      @blur="onEmailBlur"
    >
    <div id="email-errors" aria-live="polite" aria-atomic="true">
      <p v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
        {{ error }}
      </p>
    </div>
    <button type="submit">
      Continue
    </button>
  </form>

  <button type="button" @click="i18n.changeLanguage(i18n.language === 'en' ? 'es' : 'en')">
    Change message language
  </button>
</template>
```

The form imports the exact caller-owned instance installed above. This focused
locale-switch flow is also compiled and exercised:

<<< ./examples/i18next-form.ts

The language event invalidates derived errors; it does not rerun the schema. Configured namespace fallback remains i18next-owned within one selected locale, while Verific applies the [shared key-first order](../localisation#the-shared-message-contract) across catalogue candidates.

## Try it in the browser

1. Select **Validate with i18next** once.
2. Change **Message language** to Español.
3. The committed message changes while **Validation runs** remains `1`.
4. Select **Demonstrate missing-key fallback**. The schema fallback and exact
   missing key and locale appear, still without another schema run. Select it
   again to restore the translated message.

<I18nextValidationExample />

::: details View the source used by this example
<<< ../../.vitepress/examples/I18nextValidationExample.vue
:::

## Missing keys and SSR

<<< ./examples/i18next-setup.ts#strict-missing

After validating in a test, read `errorsFor('email')` to exercise this strict
adapter. The shown factory is compiled and its throw path is tested.

For SSR, create and initialise the i18next instance and adapter inside each request. Dispose the adapter when that request or application finishes; never export a mutable server singleton. See the [request-safe Nuxt plugin](../nuxt#manual-i18next-plugin).

See the [shared missing-message policies](../localisation#missing-messages) and [`@verific/i18next` package README](https://github.com/josephanson/verific/tree/main/packages/i18next) for the complete adapter surface.
