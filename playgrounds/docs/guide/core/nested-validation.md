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

This form's parent calls `useValidation()` without a schema. Its mounted field components each call `useValidation(schema, model)` and automatically join that parent scope. It illustrates collection and disposal of registrations; the child-owned values in this demo are not a parent submission payload. Use the parent-owned recipe below when building a split form that saves data.

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

The parent owns one reactive model and passes each fragment to a child through Vue's `v-model`. Each child uses `defineModel()` to keep that parent connection and registers its fragment with the nearest scope. The scope collects validation results; the parent's model supplies the payload.

These schemas deliberately do not transform their inputs, so validated parent-owned strings can be sent directly. If your child schemas transform values, consume their registration outputs explicitly or validate a complete parent schema; the scope does not merge transformed outputs into a payload.

<<< ../examples/workflows/contact.ts

The service posts to your application's `/api/contacts` endpoint. Replace it with your existing client if needed; the optional `save` prop on the parent accepts the same function contract.

<<< ../examples/workflows/contact-service.ts

The parent creates its independent scope before either descendant is set up. Its handler snapshots both fragments, prevents duplicate submissions and rebases only if the raw strings still match after saving.

<<< ../examples/workflows/ContactForm.vue

Each descendant joins that scope rather than creating another one. `at` gives its issues a distinct prefix, while local selectors remain relative to that prefix.

<<< ../examples/workflows/ContactDetails.vue

<<< ../examples/workflows/PostalAddress.vue

The children validate directly on blur. They do not record touch; add an explicit `touch()` call only if the application uses interaction state. The [save workflow](./service-layer-to-validation) explains pending state, request failures and safe rebasing in more detail.

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
