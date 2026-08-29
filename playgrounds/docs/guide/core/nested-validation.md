---
outline: deep
---

<script setup>
import NestedValidationExample from '../../.vitepress/examples/NestedValidationExample.vue'
</script>

# Scopes and registrations

A **scope** groups registrations that must validate together. A **registration** is one schema and model pair. Aggregate `state` covers only the registrations that are currently active in that scope.

The simplest call creates both when no scope is available:

```ts
const { validate, errorsFor } = useValidation(schema, model)
```

## How a parent collects descendant registrations

<ol class="verific-flow" aria-label="How a parent scope collects descendant registrations">
  <li>
    <strong>The parent creates the scope.</strong>
    An orchestration-only <code>useValidation()</code> call establishes the shared boundary and exposes its <code>validate()</code> action.
  </li>
  <li>
    <strong>Each descendant registers locally.</strong>
    A child calls <code>useValidation(schema, model)</code>; its schema and model join the nearest scope that already exists in its component branch.
  </li>
  <li>
    <strong>The parent validates the active collection.</strong>
    One <code>validate()</code> call runs every current registration and collects their issues. A disposed descendant's dirty and touched contributions leave immediately; outstanding work is revoked and aggregate validating clears when the coordinating run promptly settles.
  </li>
</ol>

## Try descendant registration {#scope-composition-demo}

This form's parent calls `useValidation()` without a schema. Its mounted field components each call `useValidation(schema, model)` and automatically join that parent scope.

1. Select **Validate parent form** with both fields empty. The parent reports two committed errors collected from its descendants.
2. Clear **Include the optional phone component**. The phone component is disposed and its committed issue immediately leaves the parent scope, while the changed registration set makes the earlier full result stale.
3. Enter a name and validate again to see the shared scope succeed.

<NestedValidationExample />

::: details View the parent source used by this example
<<< ../../.vitepress/examples/NestedValidationExample.vue
:::

::: details View the descendant registrations used by this example
<<< ../../.vitepress/examples/NestedNameField.vue

<<< ../../.vitepress/examples/NestedPhoneField.vue
:::

## Split a form across components

The runnable parent above establishes the shared scope before its descendants are created:

```vue [ContactForm.vue]
<script setup lang="ts">
import { useValidation } from '@verific/core'
import ContactDetails from './ContactDetails.vue'
import PostalAddress from './PostalAddress.vue'

const { issues, state, validate } = useValidation()

async function submit() {
  const outcome = await validate()
  if (outcome.success && state.value.validated && !state.value.stale) {
    // Submit application-owned state.
  }
}
</script>

<template>
  <form
    novalidate
    data-validation-required-descendants
    aria-describedby="contact-required-instructions"
    @submit.prevent="submit"
  >
    <p id="contact-required-instructions">
      Complete every required contact and postal address field.
    </p>
    <ContactDetails />
    <PostalAddress />
    <button type="submit">
      Submit
    </button>
  </form>

  <p aria-live="polite">
    {{ issues.length ? `${issues.length} validation issue(s)` : '' }}
  </p>
</template>
```

A descendant registers its own schema and model with the nearest scope:

```vue [ContactDetails.vue]
<script setup lang="ts">
import { useValidation } from '@verific/core'
import { reactive } from 'vue'
import { z } from 'zod'

const details = reactive({ email: '' })
const schema = z.object({ email: z.string().email() })
const { errorsFor, hasError } = useValidation(schema, details)
</script>

<template>
  <label for="contact-email">Email</label>
  <input
    id="contact-email"
    v-model="details.email"
    required
    :aria-invalid="hasError('email')"
    :aria-describedby="hasError('email') ? 'contact-email-errors' : undefined"
  >
  <div id="contact-email-errors" aria-live="polite">
    <p v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
      {{ error }}
    </p>
  </div>
</template>
```

The postal-address descendant follows the same registration pattern:

```vue [PostalAddress.vue]
<script setup lang="ts">
import { useValidation } from '@verific/core'
import { reactive } from 'vue'
import { z } from 'zod'

const address = reactive({ postcode: '' })
const schema = z.object({ postcode: z.string().min(1, 'Enter a postcode') })
const { errorsFor, hasError } = useValidation(schema, address)
</script>

<template>
  <label for="postal-postcode">Postcode</label>
  <input
    id="postal-postcode"
    v-model="address.postcode"
    required
    :aria-invalid="hasError('postcode')"
    :aria-describedby="hasError('postcode') ? 'postal-postcode-errors' : undefined"
  >
  <div id="postal-postcode-errors" aria-live="polite">
    <p v-for="(error, index) in errorsFor('postcode')" :key="`${index}:${error}`">
      {{ error }}
    </p>
  </div>
</template>
```

## Component-tree rules

A call can join only a scope created earlier in the same component setup or provided by an ancestor. It cannot discover a scope created later, by a sibling, or in another component branch.

Disposal immediately removes a registration's issues, result, dirty baseline and touch records. Outstanding work for that registration is revoked, while aggregate pending and validating state clears when the coordinating run promptly settles rather than synchronously during disposal. Because the participating registration set changed, affected committed validation becomes stale. If another active registration contributes to the same resolved path, its contribution remains. See [Form state](./form-state) for the aggregate and exact selectors.

The nearest scope wins. Start an independent nested form explicitly:

```ts
const { errorsFor, validate } = useValidation(schema, model, { scope: 'new' })
```

That nested scope does not inherit the outer scope's resolver or message prefix. It starts with application-level defaults.

## Place a registration at a path

Use `at` when a child model represents a fragment of the scope's logical model:

```ts
const { errorsFor, hasError } = useValidation(addressSchema, address, {
  at: ['shipping'],
})

hasError('postcode')
errorsFor('postcode')
// Selects the resolved path ['shipping', 'postcode'].
```

`at` changes resolved issue paths; it does not select or reshape the value passed to the schema. Nested selectors always use property-key arrays, not dotted strings:

```ts
errorsFor(['location', 'postcode'])
```

## Next task

Continue with [choose between issues and errors](/guide/core/issues-and-errors) to use structured failures for application logic and resolved strings for display, or [Advanced schemas](/guide/core/advanced-schemas) for complex paths and structural changes.
