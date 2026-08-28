---
outline: deep
---

# Vue I18n

Use `@verific/vue-i18n` with a caller-owned Vue I18n 11 Composition API Composer. The same adapter powers the automatic Nuxt I18n integration.

## Install and configure the application

```bash
pnpm add @verific/core @verific/vue-i18n vue vue-i18n zod
```

<<< ./examples/vue-i18n-setup.ts

Call `installValidation(app)` before mounting the application. This displayed
source is compiled by the documentation test suite against the exported adapter.

## Use it in a form

```vue [SignupForm.vue]
<script setup lang="ts">
import { useValidation } from '@verific/core'
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'

const { locale } = useI18n()
const form = reactive({ email: '' })
const schema = z.object({ email: z.email() })
const { errorsFor, hasError, validate, validateFor } = useValidation(schema, form, {
  messagePrefix: 'forms.signup',
})

async function submit() {
  const result = await validate()
  if (result.success) {
    // Submit application-owned state.
  }
}
</script>

<template>
  <form novalidate @submit.prevent="submit">
    <label for="email">Email</label>
    <input
      id="email"
      v-model="form.email"
      type="email"
      :aria-invalid="hasError('email')"
      aria-describedby="email-errors"
      @blur="validateFor('email')"
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

  <button type="button" @click="locale = locale === 'en' ? 'es' : 'en'">
    Change message language
  </button>
</template>
```

Changing `locale` updates the committed error text without another schema run. Vue I18n locale fallback is honoured, but Verific still applies the [shared key-first order](../localisation#the-shared-message-contract).

## Local Composers

A component-local Composer can own form translations. Set `fallbackRoot = false`, then pass its adapter to the registration:

```ts
const composer = useI18n({ useScope: 'local', messages: localMessages })
composer.fallbackRoot = false

const { errorsFor, validate } = useValidation(schema, form, {
  messagePrefix: 'forms.checkout',
  messages: vueI18nMessages(composer),
})
```

This lets a miss continue to inherited Verific resolvers instead of Vue I18n consulting its root Composer out of order.

## Missing keys and SSR

Use `missing: 'throw'` in exercised tests and read an error selector after validation:

```ts
const messages = vueI18nMessages(i18n.global, {
  fallbackPrefix: 'errors',
  missing: 'throw',
})
```

For SSR, obtain the Composer from the current application or request. `@verific/nuxt` does this automatically with `@nuxtjs/i18n`; see [Nuxt automatic Vue I18n](../nuxt#automatic-vue-i18n-integration). Do not share a mutable Composer between requests.

See the [shared missing-message policies](../localisation#missing-messages) and [`@verific/vue-i18n` package README](https://github.com/josephanson/verific/tree/main/packages/vue-i18n) for the complete adapter surface.
