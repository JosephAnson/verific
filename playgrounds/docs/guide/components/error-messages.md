---
title: Rendering errors
outline: deep
---

# Rendering errors

## Render an error array

`errorsFor()` returns an array of strings, so native Vue rendering is usually
all a form needs:

```vue
<script setup lang="ts">
import { useValidation } from '@verific/core'
import { reactive } from 'vue'
import { z } from 'zod'

const form = reactive({ email: '' })
const schema = z.object({ email: z.string().email() })
const { errorsFor, validate } = useValidation(schema, form)

async function submit() {
  if ((await validate()).success) {
    // Submit form.email.
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
      :aria-invalid="errorsFor('email').length > 0"
      :aria-describedby="errorsFor('email').length ? 'email-errors' : undefined"
    >

    <ul id="email-errors" aria-live="polite">
      <li v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
        {{ error }}
      </li>
    </ul>

    <button type="submit">
      Continue
    </button>
  </form>
</template>
```

The input points to the error list only while errors exist. `aria-invalid`
exposes the same state to assistive technology. `novalidate` ensures native
browser validation does not stop Verific's submit handler from running.

The application owns the list, styling and live-region behaviour. This works
with native HTML or the equivalent elements from a design system.

Try the [interactive validation example](/guide/#basic-validation-demo) to see an error array announced, associated with its input and cleared after a valid submission. The example reveals the exact Vue component that is running on the page.

## Normalise flexible message inputs

When a form can receive strings, nested arrays or conditional message records,
import the optional renderless `ErrorMessages` component:

```ts
import { ErrorMessages } from '@verific/core'
```

In the same form, replace the `v-for` list items with its scoped slot:

```vue
<ul id="email-errors" aria-live="polite">
  <ErrorMessages v-slot="{ message, index }" :messages="errorsFor('email')">
    <li :key="`${index}:${message}`">
      {{ message }}
    </li>
  </ErrorMessages>
</ul>
```

The component normalises its input, then invokes the slot once for every
resulting string in order. The zero-based `index` is available for a stable
rendering key.

`ErrorMessages` adds no wrapper or message element and does not forward
attributes. Without a default slot it renders no message markup. The form still
owns the `<ul>` and `<li>` elements; Verific owns only message normalisation.

## Conditional messages

Conditional records let the same form combine validation errors with
application-owned display rules. For example, add state for an API error:

```ts
import { ref } from 'vue'

const verificationFailed = ref(false)
```

Then pass both sources to `ErrorMessages`; the slot markup stays unchanged:

```vue
<ErrorMessages
  v-slot="{ message, index }"
  :messages="[
    errorsFor('email'),
    { 'We could not verify this email': verificationFailed },
  ]"
>
  <p :key="`${index}:${message}`" class="error" role="alert">
    {{ message }}
  </p>
</ErrorMessages>
```

For validation alone, prefer the direct `errorsFor()` array shown first.
