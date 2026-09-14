---
title: Rendering errors
outline: deep
---

# Rendering errors

## Render an error array

`errorsFor()` returns an array of strings, so native Vue rendering is usually
all a form needs:

<<< ../examples/rendering/RenderingErrorsForm.vue

The complete source above is typechecked with the other documentation examples.
The input always points to its persistent error list. `aria-invalid` exposes
whether an error is present to assistive technology. `novalidate` ensures native
browser validation does not stop the schema validation handler from running.

Blur validates the email path directly, and submission validates the complete
form. This example only renders validation errors; the
[save workflow](../core/service-layer-to-validation) adds an application-owned request.

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
<ul id="rendering-email-errors" aria-live="polite">
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
  <li :key="`${index}:${message}`">
    {{ message }}
  </li>
</ErrorMessages>
```

For validation alone, prefer the direct `errorsFor()` array shown first.
