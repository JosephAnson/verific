---
outline: deep
next:
  text: Scopes and registrations
  link: /guide/core/nested-validation
---

<script setup>
import BasicValidationExample from '../.vitepress/examples/BasicValidationExample.vue'
</script>

# Getting started

Verific validates an application-owned model with any [Standard Schema](https://standardschema.dev/) schema. It returns structured issues for logic and error strings for display; it does not own input state, touched state or submission.

## Choose a task

- **Validate one form:** continue with the complete example on this page.
- **Compose descendant registrations:** learn how [scopes collect nested forms](/guide/core/nested-validation).
- **Render or localise errors:** [configure localised messages](/guide/localisation) while keeping accessible markup under your control.
- **Use Verific with Nuxt:** [configure the Nuxt module](/guide/nuxt) once for an application.

## Install

::: code-group

```bash [pnpm]
pnpm add @verific/core zod
```

```bash [npm]
npm install @verific/core zod
```

```bash [yarn]
yarn add @verific/core zod
```

:::

No plugin is required. The following form uses Zod, but any Standard Schema-compatible library can supply the schema.

## Try validation in the browser {#basic-validation-demo}

This example is the complete `useValidation(schema, model)` workflow. Try it in three states:

1. Leave the empty **Email address** field. `validateFor('email')` runs the complete schema but publishes only the email issue; the untouched password remains quiet.
2. Select **Validate account** without entering anything. `validate()` publishes the complete form result and moves focus to the first invalid input.
3. Enter a valid email address and a password of at least eight characters, then validate again. The errors clear and the form reports a valid outcome.

<BasicValidationExample />

::: details View the source used by this example
<<< ../.vitepress/examples/BasicValidationExample.vue
:::

The component owns its refs and submission state. `validateFor(path)` is useful for blur or change events: it captures the complete model and runs the complete Standard Schema, then publishes issues only at that exact path. `validate()` publishes the full result and remains the method to await before submission. Both methods may be asynchronous.

Before localisation is configured, `errorsFor()` returns the prose supplied by the schema. See [localising errors](/guide/localisation) when the form is working.

## The model in five terms

1. A **scope** is everything validated by one `validate()` call.
2. A **registration** is one schema and model pair in that scope. The example above creates both the scope and its first registration.
3. A schema failure becomes a structured **issue**.
4. A message resolver turns an issue into a ready-to-render **error** string. Schema prose is the fallback.
5. A successful registration may expose **transformed output** from the schema; Verific does not write it back to the model.

For a form split across components, continue with [scopes and registrations](/guide/core/nested-validation). The `useValidation` page in Reference documents the complete controller interface.
