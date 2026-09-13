# `@verific/core`

Model-based Standard Schema validation for Vue 3.

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
const { errorsFor, on, state, validate } = useValidation(schema, { email })
const emailBinding = on('email', { describedBy: 'email-errors' })

async function submit() {
  const result = await validate()
  if (result.success && state.value.validated && !state.value.stale) {
    // Submit application-owned state.
  }
}
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
      v-bind="emailBinding"
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

`on('email')` binds blur and change to one value-deduplicated commit without
owning the model. Use full `validate()` as the submission gate and
to populate typed transformed output. The aggregate state guard prevents an
older async snapshot from reaching application submission. See
[Binding form controls](https://verific.josephanson.com/guide/core/form-controls)
for the recommended value and event patterns.

The package has three runtime exports:

- `useValidation` creates or joins a validation scope;
- `createVerific` configures application-wide message handling;
- [`ErrorMessages`](https://verific.josephanson.com/guide/components/error-messages) optionally normalises error inputs.

Read the canonical [Vue guide](https://verific.josephanson.com/guide/),
form-control
[binding guide](https://verific.josephanson.com/guide/core/form-controls),
[form-state guide](https://verific.josephanson.com/guide/core/form-state),
[advanced-schema guide](https://verific.josephanson.com/guide/core/advanced-schemas),
[`useValidation` reference](https://verific.josephanson.com/guide/reference/use-validation)
and [localisation guide](https://verific.josephanson.com/guide/localisation).

## Licence

MIT
