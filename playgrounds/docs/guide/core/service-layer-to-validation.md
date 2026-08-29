---
outline: deep
---

# Submitting validated data

Keep network calls separate from validation. Call the service only after the scope succeeds, and use the registration's transformed output when the schema changes its input.

```ts [user.ts]
import { z } from 'zod'

export const userSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1),
})

export type User = z.output<typeof userSchema>
```

```ts [user-service.ts]
import type { User } from './user'

export async function registerUser(user: User) {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(user),
  })

  if (!response.ok)
    throw new Error('Registration failed')
}
```

```vue [RegistrationForm.vue]
<script setup lang="ts">
import { useValidation } from '@verific/core'
import { reactive } from 'vue'
import { userSchema } from './user'
import { registerUser } from './user-service'

const form = reactive({ email: '', displayName: '' })
const { errorsFor, result, state, validate } = useValidation(userSchema, form)

async function submit() {
  const outcome = await validate()
  if (
    !outcome.success
    || result.value.status !== 'valid'
    || !state.value.validated
    || state.value.stale
  ) {
    return
  }

  const user = result.value.value
  await registerUser(user)
}
</script>

<template>
  <form novalidate aria-describedby="registration-required-instructions" @submit.prevent="submit">
    <p id="registration-required-instructions">
      All fields are required.
    </p>
    <label for="email">Email</label>
    <input
      id="email"
      v-model="form.email"
      type="email"
      required
      :aria-invalid="errorsFor('email').length > 0"
      :aria-describedby="errorsFor('email').length ? 'email-errors' : undefined"
    >
    <ul id="email-errors" aria-live="polite">
      <li v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
        {{ error }}
      </li>
    </ul>

    <label for="display-name">Display name</label>
    <input
      id="display-name"
      v-model="form.displayName"
      required
      :aria-invalid="errorsFor('displayName').length > 0"
      :aria-describedby="errorsFor('displayName').length ? 'display-name-errors' : undefined"
    >
    <ul id="display-name-errors" aria-live="polite">
      <li
        v-for="(error, index) in errorsFor('displayName')"
        :key="`${index}:${error}`"
      >
        {{ error }}
      </li>
    </ul>

    <button type="submit">
      Register
    </button>
  </form>
</template>
```

Here the schema trims both values and lowercases the email. `result.value.value` is that typed transformed output. The state guard ensures it still describes the current model if validation was asynchronous. Verific deliberately does not write it back to `form`.

The value returned by `validate()` reports whether the whole scope succeeded and contains aggregate issues. The registration's `result` is where its own output lives. The application still decides when to submit and what to do afterwards. Service and network failures are not schema issues; handle them separately.
