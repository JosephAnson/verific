---
outline: deep
---

<script setup>
import LocalisedValidationExample from '../.vitepress/examples/LocalisedValidationExample.vue'
</script>

# Localisation adapters

Keep validation rules in the schema and translations in your locale catalogue. Verific describes recognised Standard Schema issues with stable identifiers such as `required`, `invalidEmail` and `minLength`; an adapter turns that structured description into text only when the component reads an error.

Choose the adapter for the locale library your application already uses:

| Application locale library | Adapter | Guide |
| --- | --- | --- |
| Vue I18n or `@nuxtjs/i18n` | `@verific/vue-i18n` | [Vue I18n](./localisation/vue-i18n) |
| i18next or i18next-vue | `@verific/i18next` | [i18next](./localisation/i18next) |
| Paraglide JS | `@verific/paraglide` | [Paraglide](./localisation/paraglide) |
| Another catalogue | `@verific/i18n` | [Custom adapters](./localisation/custom-adapters) |

Each adapter is optional and independently installed. Core does not depend on a locale library.

## The shared message contract

Suppose an `invalidEmail` issue occurs at `email` and the form uses `messagePrefix: 'forms.signup'`. With `fallbackPrefix: 'errors'`, every catalogue adapter uses this key-first order:

1. `forms.signup.email.invalidEmail` in every configured locale, in locale order;
2. `errors.invalidEmail` in every configured locale, in locale order;
3. the original Standard Schema message when every configured resolver misses.

Key-first means a form-specific translation in a fallback locale wins over a shared translation in the active locale. Nested string and number paths are included automatically, for example `forms.checkout.contacts.0.email.invalidEmail`.

The schema remains locale-independent:

```ts [SignupForm.vue]
const { errorsFor, hasError, validate, validateFor } = useValidation(schema, form, {
  messagePrefix: 'forms.signup',
})
```

Adapters receive semantic interpolation values such as `minimum`, `maximum` and `expected`. Length issues also receive `count` for plural selection. Verific does not copy model values into translation parameters or require translated prose in the schema.

## Missing messages

All catalogue adapters support the same policy:

| `missing` | Behaviour after the complete resolver chain misses |
| --- | --- |
| omitted | Warn in development; remain silent in production |
| `'silent'` | Return the schema message without reporting |
| `'warn'` | Emit an actionable development warning |
| `'throw'` | Throw, so an exercised test or build-render path fails |
| callback | Receive the structured final diagnostic |

Use strict mode in tests:

```ts
const messages = vueI18nMessages(i18n.global, {
  fallbackPrefix: 'errors',
  missing: 'throw',
})

await validate()
expect(() => errorsFor('email')).not.toThrow()
```

Resolution is lazy, so the test must read `errors`, `errorsFor()` or `errorFor()` after validation. A diagnostic contains the complete ordered key-and-locale attempts from every adapter in the resolver chain. A later resolver success suppresses the diagnostic. Warnings are deduplicated with a finite per-adapter cache to prevent noise; that cache is not proof that a catalogue is complete.

Static analysis cannot discover every runtime schema outcome, prefix and dynamic path. Combine `missing: 'throw'` in exercised form tests with your locale library's catalogue typing or locale-parity check.

## Locale changes do not revalidate

Error strings are derived lazily from stored structured issues. Adapters read their caller-owned locale source while Vue evaluates those strings, so changing locale updates rendered text without rerunning the schema.

1. Select **Validate email** once.
2. Change **Message language**.
3. Notice that the message changes while **Validation runs** does not.
4. Select **Demonstrate missing-key fallback** to see the raw schema fallback
   and exact missing key and locale without another validation run. Select it
   again to restore the translated message.

<LocalisedValidationExample />

::: details View the source used by this example
<<< ../.vitepress/examples/LocalisedValidationExample.vue
:::

For server rendering, create or obtain locale state inside the request or application boundary. Do not store a mutable Composer, i18next instance, locale ref or Verific adapter in a process-global singleton.

## Compatibility

The tested baselines match each adapter package's peer dependencies.

<!-- verific-adapter:@verific/vue-i18n runtime=vue-i18n factory=vueI18nMessages -->
<!-- verific-adapter:@verific/i18next runtime=i18next factory=i18nextMessages -->
<!-- verific-adapter:@verific/paraglide runtime=@inlang/paraglide-js factory=paraglideMessages -->

| Adapter | Direct locale runtime | Supported range | Tested baseline |
| --- | --- | --- | --- |
| `@verific/vue-i18n` | `vue-i18n` | `>=11.4 <12` | `11.4.10` |
| `@verific/i18next` | `i18next` | `>=26 <27` | `26.4.0` |
| `@verific/i18next` | `vue` (reactivity) | `^3.4.26` | `^3.5.42` |
| `@verific/paraglide` | `@inlang/paraglide-js` | `>=2 <3` | `2.25.0` |

Vue I18n, i18next and Paraglide are not transitive requirements of one another. See [Nuxt](./nuxt) for automatic Vue I18n integration and request-safe manual setup for the other adapters, or read the [message-resolution reference](./reference/messages) for the core contracts.
