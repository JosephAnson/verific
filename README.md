<p align="center">
  <a href="https://verific.josephanson.com">
    <img src="https://verific.josephanson.com/logo.png" width="180" alt="Verific">
  </a>
</p>

<p align="center">Your model stays yours. Your error messages speak your app's language.</p>

Verific validates the Vue refs and reactive models you already own, then resolves
error messages through your app's locale system. Keep your components and stores,
use Zod, Valibot or another [Standard Schema](https://standardschema.dev/) validator,
and choose when validation runs.

- **Keep your model and UI.** Add validation to existing refs, a reactive model or
  a store. Connect events, props and slots using your component library's API.
- **Use your translation catalogue.** Normalise vendor issues into meanings such
  as `minLength` with `{ minimum: 3 }`, then resolve them through Vue I18n,
  i18next, Paraglide or your own message resolver.
- **Submit across components.** Participating components share a validation
  scope, so one submit can validate their schemas together.

## Install

```bash
pnpm add @verific/core zod
```

Packages are ESM-only. Locale adapters share one optional package,
`@verific/i18n`, with separate `vue-i18n`, `i18next` and `paraglide` subpath
imports. See [Localisation](https://verific.josephanson.com/guide/localisation).

CI enforces a **12 kB minified + gzip budget** for all public core exports
together, with Vue excluded. Run `pnpm size:check` to measure the current build.

## Vue quick start

```vue
<script setup lang="ts">
import { useValidation } from '@verific/core'
import { ref } from 'vue'
import { z } from 'zod'

const email = ref('')
const schema = z.object({ email: z.string().email() })
const { commit, errorsFor, hasError, handleSubmit } = useValidation(schema, { email })
const submit = handleSubmit(() => {
  // Send email.value to your API after successful, current validation.
})
</script>

<template>
  <form novalidate aria-describedby="email-required-instructions" @submit.prevent="submit">
    <p id="email-required-instructions">
      Email is required.
    </p>
    <label for="email">Email</label>
    <input
      id="email"
      v-model="email"
      type="email"
      required
      :aria-invalid="hasError('email')"
      aria-describedby="email-errors"
      @blur="commit('email')"
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

`commit('email')` combines touch and targeted validation, with deduplication and
optional debounce. `handleSubmit()` runs full validation and manages submission
state. Use `touch()`, `validateAt()` and `validate()` separately when you need
more control. Targeted validation still runs the complete matching schemas,
including async rules, before selecting one path's issues.
See [Binding form controls](https://verific.josephanson.com/guide/core/form-controls)
for number, choice, file, repeated-row and custom-control patterns.

The `@verific/core` runtime exports are `useValidation`, `createValidationScope`, `createVerific` and
`ErrorMessages`. Most forms only need `useValidation`; `createVerific` adds
application-wide message handling, while `ErrorMessages` is an optional error
input normaliser. See [Rendering errors](https://verific.josephanson.com/guide/components/error-messages).

## Learn more

- [Getting started](https://verific.josephanson.com/guide/)
- [Compare Verific](https://verific.josephanson.com/guide/comparison)
- [Server issues, submission and arrays](https://verific.josephanson.com/guide/core/production-forms)
- [Binding form controls](https://verific.josephanson.com/guide/core/form-controls)
- [Form state](https://verific.josephanson.com/guide/core/form-state)
- [Advanced schemas](https://verific.josephanson.com/guide/core/advanced-schemas)
- [`useValidation` reference](https://verific.josephanson.com/guide/reference/use-validation)
- [Localisation](https://verific.josephanson.com/guide/localisation)
- [Nuxt](https://verific.josephanson.com/guide/nuxt)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Licence

Released under the [MIT licence](./LICENSE).
