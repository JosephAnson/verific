---
outline: deep
---

# Why Verific?

Verific validates the Vue model you already own and resolves error messages
through your app's locale system. It fits an existing form, a design system or a
store where values and control behaviour already have a home.

## Your model stays yours

Pass a schema and your refs or reactive object to `useValidation()`. Keep binding
inputs to those same values. You can add validation to one form at a time without
replacing the components or moving the model into another state container.

Call `commit(path)` from the event that makes sense for each control. Map
`hasError(path)` and `errorsFor(path)` to your component's own props or slots.
Verific's core does not infer event names, prop names, value payloads or ARIA
placement. See [Binding form controls](./core/form-controls) for native and custom
component examples.

## Error messages belong in your app's locale system

The schema reports a structured issue. Verific preserves that original issue
and can describe known vendor shapes with a meaning such as `minLength` and
`{ minimum: 3 }`. A locale adapter then uses that meaning to look up a message
in your existing translation catalogue.

Your app keeps its locale selection, pluralisation and catalogue conventions.
Unknown issue shapes fall back to the schema's message, and you can add your own
normaliser. See [Localisation](./localisation).

## One submit across participating components

Components can register their own schema and model in a shared **scope**. One
`validate()` or `handleSubmit()` action validates the active registrations
together, even when the form is split into sections. A removed component stops
contributing, and an independent nested form can create its own scope.

This requires participating components or a parent that can register their model;
Verific does not discover hidden values inside arbitrary third-party controls.
Read [Forms across components](./core/nested-validation) for the composition
rules, or use an [explicit scope](./core/production-forms#validation-outside-a-component)
outside a component.

## A deliberate division of responsibilities

| Verific provides | Your application decides |
| --- | --- |
| Schema coordination, exact-path issues and safe async results | Model values, schema rules and control components |
| Dirty baselines, touched state and validation freshness | Interaction timing and when to display messages |
| Server-issue storage, array metadata helpers and submission state | API response mapping, stable row keys and submission side effects |
| Semantic issue descriptions and locale adapters | Translation catalogues, locale selection and accessible markup |

The optional array helpers edit the supplied writable ref when you explicitly
call insert, remove or move. Validation itself never writes transformed output
back into the model.

Standard Schema support makes schema reuse convenient; it is shared with other
form libraries. See [Compare Verific](./comparison) for the trade-offs and
[Getting started](./index) for a working form.
