---
outline: deep
---

# Compare Verific

Choose Verific when your Vue model and components already exist and you want
validation messages in your app's locale system. It adds schema coordination,
validation state and message resolution around that model.

Standard Schema support alone is not a reason to switch. Other libraries also
accept compatible schemas, including
[vee-validate v5](https://vee-validate.logaretm.com/v5/api/use-form/),
[Regle](https://reglejs.dev/integrations/schemas-libraries/),
[TanStack Form](https://tanstack.com/form/latest/docs/framework/vue/guides/validation#standard-schema-libraries)
and [Formwerk](https://formwerk.dev/guides/forms/validation/#standard-schema-validation).

## Compare the integration approach

This table describes the documented workflows, not every possible custom
integration. Links point to the projects' own documentation, checked on
14 September 2026.

| Library | How values enter validation | What you connect to your UI |
| --- | --- | --- |
| Verific | Pass existing refs or a reactive model alongside a Standard Schema. | Explicit actions such as `commit(path)` and selectors such as `errorsFor(path)`; your app maps events, props and slots. |
| [vee-validate v5](https://vee-validate.logaretm.com/v5/api/use-form/) | `useForm` tracks form values and provides field APIs and setters. | Composables or field components, with configurable integration into your controls. |
| [Regle](https://reglejs.dev/core-concepts/) | Pass a raw object, reactive object, ref or object of refs. | The reactive `r$` validation tree; you can also keep binding to your own reactive model. |
| [TanStack Form for Vue](https://tanstack.com/form/latest/docs/framework/vue/guides/validation) | `useForm` and field APIs track values; field handlers receive updates. | Field state and explicit handlers, with field-level or form-level validators and trigger policies. |
| [Formwerk](https://formwerk.dev/guides/getting-started/) | Control and form composables manage values and behaviour; custom controls can expose `v-model`. | Control-specific props and composables that also handle interactions and accessibility. |

Regle already supports application-owned reactive state. Keeping your model is
therefore a useful Verific property, not an exclusive claim. The practical reason
to evaluate Verific is the combination of that model boundary with composed
scopes and semantic issue resolution.

## Where Verific fits

### Keep an existing form or store

Add `useValidation(schema, model)` around the state you have. Keep your
`v-model` expressions and map the validation selectors into your component
library's error props or slots. For a store or service, use
[`createValidationScope()`](./core/production-forms#validation-outside-a-component).

The core supplies no universal binding object. A component may emit a value,
use a custom commit event, or expose accessibility props through a nested input
API. Your integration expresses that contract directly.

### Keep one translation catalogue

Verific preserves vendor issues and can turn supported shapes into a semantic
identifier and parameters, such as `minLength` with `{ minimum: 3 }`.
Vue I18n, i18next, Paraglide or a custom resolver then supplies the displayed
message. Your app retains locale selection and catalogue structure.

This is useful when validation messages must follow the same localisation
workflow as the rest of a product. Unsupported issue shapes keep their original
message until you supply a normaliser. See [Localisation](./localisation).

### Coordinate sections of a form

Participating components register schemas and models in a shared scope. One
submit validates the active sections together, while each component selects
its own errors. You do not need to replace the UI with Verific field components.
See [Forms across components](./core/nested-validation).

## Understand the trade-offs

- You write the mapping from control events and error props to validation.
  Verific does not supply focus management, keyboard behaviour or accessible
  control primitives. A component library may already provide those.
- `validateAt(path)` and non-deduplicated commits run the complete matching
  schemas, including async and cross-field rules. Debounce reduces run frequency;
  it does not turn a large schema into a field-only validator.
- Array helpers preserve row metadata but structural edits invalidate scope
  results. Child registration prefixes and component keys remain your
  responsibility.
- A schema's transformed output is separate from the model and available through
  its controller's `result`.

If your current library fits your state and localisation workflow, there is no
need to migrate for schema compatibility alone.

## Try one form first

1. Keep the form's existing refs or reactive model.
2. Register its schema with `useValidation(schema, model, { scope: 'new' })` to
   create an isolated boundary.
3. Call `commit(path)` after the relevant control updates its value. Map error
   selectors through that component's actual API.
4. Use `handleSubmit()` for the submission callback and connect one locale
   adapter when translated messages are needed.
5. Add participating child components to the scope when the form is ready.

The [quick start](./index), [control guide](./core/form-controls) and
[production workflows](./core/production-forms) show the complete patterns.
