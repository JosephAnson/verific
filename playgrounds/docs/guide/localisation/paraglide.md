---
outline: deep
---

<script setup>
import ParaglideValidationExample from '../../.vitepress/examples/ParaglideValidationExample.vue'
</script>

# Paraglide

`@verific/paraglide` accepts an explicit map of generated Paraglide 2 message functions. The map is typed, auditable and tree-shakeable; the adapter never guesses generated export names or reads a process-global locale.

## Install and configure the application

```bash
pnpm add @inlang/paraglide-js @verific/core @verific/paraglide vue zod
```

After [generating your Paraglide messages](https://inlang.com/m/gerre34r/library-inlang-paraglideJs), statically import each function used for validation:

<<< ./examples/paraglide-setup.ts

Call `installValidation(app)` before mounting. The imported message module is
actual Paraglide-generated output, and this displayed source is compiled by the
documentation test suite against the exported adapter.

Every catalogue key is visibly paired with one generated function. Functions keep their concrete input types; no wrapper or cast is required. Verific passes semantic values as inputs, includes `count` only when present and supplies the selected locale through Paraglide's options argument.

## Use it in a form

```vue [SignupForm.vue]
<script setup lang="ts">
import { useValidation } from '@verific/core'
import { reactive } from 'vue'
import { z } from 'zod'
import { messageLocale } from './paraglide-setup'

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
  <form novalidate aria-describedby="paraglide-required-instructions" @submit.prevent="submit">
    <p id="paraglide-required-instructions">
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

  <button type="button" @click="messageLocale = messageLocale === 'en' ? 'es' : 'en'">
    Change message language
  </button>
</template>
```

The form imports the exact reactive locale exported by the setup above. This
focused locale-switch flow is also compiled and exercised:

<<< ./examples/paraglide-form.ts

Reading `messageLocale.value` in the required `locale` getter makes rendered errors reactive. Changing it updates existing error text without rerunning the schema.

## Try it in the browser

1. Select **Validate with Paraglide** once.
2. Change **Message language** to Español.
3. The committed message changes while **Validation runs** remains `1`.
4. Select **Demonstrate missing-key fallback**. The schema fallback and exact
   missing key and locale appear, still without another schema run. Select it
   again to restore the translated message.

<ParaglideValidationExample />

::: details View the source used by this example
<<< ../../.vitepress/examples/ParaglideValidationExample.vue
:::

## Missing keys and SSR

An explicit map catches base keys at compile time. Runtime form prefixes and issue paths can still miss, so use strict mode in exercised tests:

<<< ./examples/paraglide-setup.ts#strict-missing

After validating in a test, read `errorsFor('email')` to exercise this strict
adapter. The shown factory is compiled against generated output and its throw
path is tested.

For SSR, create a request-owned locale ref or getter and create the adapter inside that application boundary. Do not call an ambient mutable locale selector. See the [request-safe Nuxt plugin](../nuxt#manual-paraglide-plugin).

See the [shared fallback contract](../localisation#the-shared-message-contract) and [`@verific/paraglide` package README](https://github.com/josephanson/verific/tree/main/packages/paraglide) for the complete adapter surface.
