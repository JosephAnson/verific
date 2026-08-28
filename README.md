<p align="center">
  <a href="https://verific.josephanson.com">
    <img src="https://verific.josephanson.com/logo.png" width="180" alt="Verific">
  </a>
</p>

<p align="center">Model-based Standard Schema validation for Vue and Nuxt.</p>

Verific validates application-owned models with Zod, Valibot or another
[Standard Schema](https://standardschema.dev/) validator. It composes schemas
across a component tree and exposes structured issues and ready-to-render error
strings without introducing another validation-rule language.

## Install

```bash
pnpm add @verific/core zod
```

## Vue quick start

```vue
<script setup lang="ts">
import { useValidation } from '@verific/core'
import { ref } from 'vue'
import { z } from 'zod'

const email = ref('')
const schema = z.object({ email: z.string().email() })
const { errorsFor, hasError, validate, validateFor } = useValidation(schema, { email })

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
      v-model="email"
      type="email"
      :aria-invalid="hasError('email')"
      aria-describedby="email-errors"
      @blur="validateFor('email')"
    >
    <div id="email-errors" aria-live="polite">
      <p v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
        {{ error }}
      </p>
    </div>
    <button type="submit">
      Submit
    </button>
  </form>
</template>
```

`validateFor('email')` runs the complete schema but publishes only that exact
path, which makes it suitable for blur validation. Use `validate()` for submit:
it publishes the complete form result and owns transformed schema output.

The `@verific/core` runtime exports are `useValidation`, `createVerific` and
`ErrorMessages`. Most forms only need `useValidation`; `createVerific` adds
application-wide message handling, while `ErrorMessages` is an optional error
input normaliser. See [Rendering errors](https://verific.josephanson.com/guide/components/error-messages).

## Learn more

- [Getting started](https://verific.josephanson.com/guide/)
- [`useValidation` reference](https://verific.josephanson.com/guide/reference/use-validation)
- [Localisation](https://verific.josephanson.com/guide/localisation)
- [Nuxt](https://verific.josephanson.com/guide/nuxt)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Licence

Released under the [MIT licence](./LICENSE).
