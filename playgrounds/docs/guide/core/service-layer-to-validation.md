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
const { validate, errorsFor, result } = useValidation(userSchema, form)

async function submit() {
  const outcome = await validate()
  if (!outcome.success || result.value.status !== 'valid')
    return

  await registerUser(result.value.value)
}
</script>

<template>
  <form novalidate @submit.prevent="submit">
    <label for="email">Email</label>
    <input
      id="email"
      v-model="form.email"
      type="email"
      :aria-invalid="errorsFor('email').length > 0"
      :aria-describedby="errorsFor('email').length ? 'email-errors' : undefined"
    >
    <ul v-if="errorsFor('email').length" id="email-errors" aria-live="polite">
      <li v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
        {{ error }}
      </li>
    </ul>

    <label for="display-name">Display name</label>
    <input
      id="display-name"
      v-model="form.displayName"
      :aria-invalid="errorsFor('displayName').length > 0"
      :aria-describedby="errorsFor('displayName').length ? 'display-name-errors' : undefined"
    >
    <ul
      v-if="errorsFor('displayName').length"
      id="display-name-errors"
      aria-live="polite"
    >
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

Here the schema trims both values and lowercases the email. `result.value.value` is that typed transformed output. Verific deliberately does not write it back to `form`.

The value returned by `validate()` reports whether the whole scope succeeded and contains aggregate issues. The registration's `result` is where its own output lives. Service and network failures are not schema issues; handle them separately.
