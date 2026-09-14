---
outline: deep
next:
  text: useValidation
  link: /guide/reference/use-validation
---

# API

Verific exports one composable: `useValidation` from `@verific/core`. It validates application-owned values and exposes reactive validation state, structured issues and resolved error strings.

## Composables

| Composable | Purpose |
| --- | --- |
| [`useValidation`](./reference/use-validation) | Create or join a validation scope, optionally register a schema and model, and read or update validation state. |

With an existing schema and model, destructure the members you need:

```ts
import { useValidation } from '@verific/core'

const { errorsFor, hasError, validate } = useValidation(schema, model)
```

The reference covers [both overloads](./reference/use-validation#signatures), [options](./reference/use-validation#options), [every returned member](./reference/use-validation#members-at-a-glance) and [path selection](./reference/use-validation#paths-and-selectors). Call the composable during Vue component setup; no plugin is required for validation.

Vue events choose when validation runs. `validate(path)` publishes issues at one exact path; `validate()` validates the complete scope before submission. `touch(path)` is an optional, separate interaction action. Observing model changes derives state such as `dirty`; it does not automatically run schemas.

## Related exports and configuration

These are factories, rendering helpers and configuration, rather than additional composables:

### Factories

| Factory | Package | Purpose |
| --- | --- | --- |
| [`createVerific`](./reference/create-verific) | `@verific/core` | Create an optional Vue plugin with application-wide message policies. |
| [`createCatalogueMessages`](./reference/catalogue-messages) | `@verific/i18n` | Connect an exact catalogue driver to message resolution and missing-message diagnostics. |
| [`vueI18nMessages`](./reference/locale-adapters#vuei18nmessages) | `@verific/vue-i18n` | Resolve messages through a caller-owned Vue I18n Composer. |
| [`i18nextMessages`](./reference/locale-adapters#i18nextmessages) | `@verific/i18next` | Resolve messages through a caller-owned i18next instance, with explicit disposal. |
| [`paraglideMessages`](./reference/locale-adapters#paraglidemessages) | `@verific/paraglide` | Resolve messages through a generated-function map and an explicit reactive locale source. |

Each factory reference covers its parameters, options, return value and ownership. The [message resolution reference](./reference/messages) explains the shared resolver types and precedence.

### Rendering and integrations

| Export or integration | Reference |
| --- | --- |
| `ErrorMessages` from `@verific/core` | [Optional renderless message helper](./components/error-messages#normalise-flexible-message-inputs) |
| Localisation setup | [Vue I18n, i18next, Paraglide and custom catalogues](./localisation) |
| `@verific/nuxt` | [Nuxt module configuration](./nuxt) |

For recipes, start with [Getting started](./index), [Binding form controls](./core/form-controls) or [Form state](./core/form-state). For async runs, transformed output, cancellation and disposal, use [Validation lifecycle](./reference/validation-lifecycle).

If errors, dirty state, submission or localisation do not behave as expected, start with the symptom-led [Troubleshooting guide](./troubleshooting).
