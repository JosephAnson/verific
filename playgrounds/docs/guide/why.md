---
outline: deep
---

# Why Verific?

Schema libraries validate a value well. Vue forms introduce a coordination problem: the application owns a model, its schemas may be registered by several components, and one submit action must validate them together.

Verific provides that coordination without replacing the schema library or becoming a field-state library.

## What Verific owns

- A **scope** that coordinates one or more registrations.
- The lifecycle of each schema and model **registration** in that scope.
- Structured **issues**, exact path selection and safe concurrent validation.
- A resolver seam that derives ready-to-render **errors** from issues.
- Each registration's typed, potentially transformed output.

## What the application owns

- The reactive model and input bindings.
- Touched, dirty and submit-attempt state.
- When validation runs and what happens after it succeeds.
- Error markup, styling and accessibility.
- Translation catalogues and locale selection.

This separation keeps `useValidation` useful with native inputs, a design system or custom field components. Error arrays are the simplest rendering interface; the optional renderless component only normalises more flexible message inputs.

## Why Standard Schema?

[Standard Schema](https://standardschema.dev/) lets Verific accept Zod, Valibot and other compatible schemas through one interface. Verific preserves each original validator issue and adds stable local and scope-resolved paths.

Known issue shapes can also receive a semantic identifier such as `invalidEmail` or `minLength`. Localisation can depend on that meaning instead of vendor-specific prose. Unknown shapes safely fall back to the schema message.

## Why scopes?

A single `useValidation(schema, model)` call creates a scope when no scope is available. Later calls in the same component or its descendants join the nearest scope, so one awaited `validate()` covers the currently registered models.

Registrations follow Vue's component lifecycle. A removed descendant no longer participates, and a deliberately independent nested form can start a new scope.

Read [scopes and registrations](/guide/core/nested-validation) for the component-tree rules.
