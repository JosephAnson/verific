# `@verific/core`

Validation for the Vue models you already own, with error messages in your
app's locale system. Keep your refs, components and stores; use a Standard Schema
validator such as Zod or Valibot.

```bash
pnpm add @verific/core zod
```

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

`commit('email')` touches and validates the current model, with deduplication
and optional debounce. `handleSubmit()` runs full validation and manages
submission state. Choose events and accessibility props for your own controls.
Targeted validation runs complete matching schemas before selecting one path's
issues. See
[Binding form controls](https://verific.josephanson.com/guide/core/form-controls)
for the recommended value and event patterns.

The package exposes these runtime APIs:

- `useValidation` creates or joins a validation scope;
- `createValidationScope` creates an explicit scope outside a component;
- `createVerific` configures application-wide message handling;
- [`ErrorMessages`](https://verific.josephanson.com/guide/components/error-messages) optionally normalises error inputs.

Read the canonical [Vue guide](https://verific.josephanson.com/guide/),
[comparison page](https://verific.josephanson.com/guide/comparison),
[production form guide](https://verific.josephanson.com/guide/core/production-forms),
form-control
[binding guide](https://verific.josephanson.com/guide/core/form-controls),
[form-state guide](https://verific.josephanson.com/guide/core/form-state),
[advanced-schema guide](https://verific.josephanson.com/guide/core/advanced-schemas),
[`useValidation` reference](https://verific.josephanson.com/guide/reference/use-validation)
and [localisation guide](https://verific.josephanson.com/guide/localisation).

## Licence

MIT
