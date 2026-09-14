---
outline: deep
next:
  text: Binding form controls
  link: /guide/core/form-controls
---

<script setup>
import BasicValidationExample from '../.vitepress/examples/BasicValidationExample.vue'
</script>

# Getting started

Verific validates the Vue models you already own and resolves error messages
through your app's locale system. Keep your refs and components, add a
[Standard Schema](https://standardschema.dev/) validator, and choose when to
validate each field.

## Choose a task

- **Validate one form:** continue with the complete example on this page.
- **Connect inputs and events:** choose a model shape and trigger in [Binding form controls](/guide/core/form-controls).
- **Track dirty, touched or stale state:** follow the [Form state](/guide/core/form-state) lifecycle.
- **Handle server errors, submission or repeated rows:** use the [production workflows](/guide/core/production-forms).
- **Build a complex schema:** try nested, repeated, custom and union rules in [Advanced schemas](/guide/core/advanced-schemas).
- **Split a form across components:** learn how [scopes collect nested forms](/guide/core/nested-validation).
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

1. Leave the empty **Email address** field. The inline `commit('email')` call records touch and validates that path. The complete schema runs, but only the email issue is published. The password path remains unpublished.
2. Select **Validate account** without entering anything. `validate()` publishes the complete form result and moves focus to the first invalid input.
3. Enter a valid email address and a password of at least eight characters, then validate again. The errors clear and the form reports a valid outcome.

<BasicValidationExample />

::: details View the source used by this example
<<< ../.vitepress/examples/BasicValidationExample.vue
:::

Most forms start with the same small, destructured controller interface:

```ts
const { commit, errorsFor, hasError, handleSubmit } = useValidation(schema, model)
```

After a field updates its model value, call `commit(path)` from the event you
choose. It combines touch and targeted validation, with deduplication and optional
debounce. `handleSubmit()` runs full validation before a submission callback and
tracks its pending state. The example above uses the lower-level `validate()`
action so it can also focus the first invalid field.

Targeted validation runs complete matching schemas before selecting one path's
issues. Use `touch()` and `validateAt()` separately when interaction and
validation should happen at different times.

Dirty state needs no event handler: it is derived reactively and becomes clean again when a value returns to its baseline. See [Form state](/guide/core/form-state) for `state`, `stateFor()` and `resetState()`.

Continue with [Binding form controls](/guide/core/form-controls) for numeric, choice, file, repeated-row and custom-control patterns.

Before localisation is configured, `errorsFor()` returns the prose supplied by the schema. See [localising errors](/guide/localisation) when the form is working.

## Terms you will meet

1. A **scope** is everything validated by one `validate()` call.
2. A **registration** is one schema and model pair in that scope. The example above creates both the scope and its first registration.
3. A schema failure becomes a structured **issue**.
4. A message resolver turns an issue into a ready-to-render **error** string. Schema prose is the fallback.
5. A successful registration may expose **transformed output** from the schema; Verific does not write it back to the model.
6. **Validation state** reports baseline changes, explicit interaction, pending work and whether a committed snapshot still describes the model.

After connecting the controls, continue with [Form state](/guide/core/form-state),
explore [Advanced schemas](/guide/core/advanced-schemas), or learn about
[forms across components](/guide/core/nested-validation). The
[`useValidation` reference](/guide/reference/use-validation) documents the
complete controller interface. If you are evaluating a migration, see
[Compare Verific](./comparison).
