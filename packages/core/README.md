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
const { errorsFor, hasError, validate, validateFor } = useValidation(schema, { email })

async function submit() {
  if ((await validate()).success) {
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

`validateFor('email')` validates the complete model while publishing only that
exact path. Use full `validate()` as the submission gate and to populate typed
transformed output.

The package has three runtime exports:

- `useValidation` creates or joins a validation scope;
- `createVerific` configures application-wide message handling;
- [`ErrorMessages`](https://verific.josephanson.com/guide/components/error-messages) optionally normalises error inputs.

Read the canonical [Vue guide](https://verific.josephanson.com/guide/),
[`useValidation` reference](https://verific.josephanson.com/guide/reference/use-validation)
and [localisation guide](https://verific.josephanson.com/guide/localisation).

## Licence

MIT
