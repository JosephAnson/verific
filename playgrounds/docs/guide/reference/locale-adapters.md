---
outline: deep
---

# Locale adapter factories

These are synchronous factories, not Vue composables. Pass their result as `messages` to [`createVerific`](./create-verific) or [`useValidation`](./use-validation). They use the same [catalogue options, key order and missing-message policies](./catalogue-messages#options-and-related-types).

Each adapter uses a caller-owned locale source. Locale changes update reactive error reads without validating again; storing `errorsFor()` in an ordinary variable stores a snapshot. See [reactive locale state](./messages#reactive-locale-state).

## `vueI18nMessages`

Import `vueI18nMessages` from `@verific/vue-i18n`. Signature:

```ts
function vueI18nMessages<Locale extends string>(
  composer: VueI18nComposer<Locale>,
  options?: VueI18nMessagesOptions,
): DiagnosticMessageAdapter
```

`composer` is the caller-owned Vue I18n 11 Composition Composer. The exported `VueI18nComposer<Locale = string>` describes the consumed surface: `locale`, `fallbackLocale`, `isGlobal`, `fallbackRoot`, `te()` and `t()`. The exported `VueI18nMessagesOptions` and `VueI18nKeyContext` alias `CatalogueMessagesOptions` and `CatalogueKeyContext` respectively; options default to `{}`.

The adapter reads the Composer's locale and fallback configuration for each resolution, checks exact translation existence and passes semantic values to `t()`. When present, semantic `count` becomes the native `plural` option. A local Composer must have `fallbackRoot: false`; the factory throws otherwise, so Vue I18n root fallback cannot bypass Verific's resolver precedence.

Returns the core [`DiagnosticMessageAdapter`](./messages#diagnostic-adapters), with no disposer or additional listeners. The application owns the Composer and its lifetime. Obtain it from the current application or request for SSR.

Use the [checked application setup and local Composer guide](../localisation/vue-i18n#install-and-configure-the-application), or the [Nuxt request-local setup](../nuxt#request-local-vue-i18n).

## `i18nextMessages`

Import `i18nextMessages` from `@verific/i18next`. Signature:

```ts
function i18nextMessages(
  i18n: I18nextInstance,
  options?: I18nextMessagesOptions,
): I18nextMessageAdapter

interface I18nextMessageAdapter extends DiagnosticMessageAdapter {
  readonly dispose: () => void
}
```

`I18nextInstance` denotes i18next's exported `i18n` type. Initialise that caller-owned instance before creating the adapter. `I18nextMessagesOptions` aliases `CatalogueMessagesOptions` and defaults to `{}`; it and `I18nextMessageAdapter` are exported from `@verific/i18next`.

Resolution uses `i18n.languages`, falling back to `resolvedLanguage` or `language` if the chain is empty. Lookups constrain i18next to one locale while retaining its configured namespace fallback. Semantic values become interpolation options; semantic `count`, when present, supplies plural selection.

The return value adds an idempotent `dispose()` to the core diagnostic adapter. It removes only this adapter's `languageChanged`, `loaded`, resource-store `added` and `removed` listeners. Those listeners make existing errors reactive; the factory does not install i18next-vue or own the supplied instance.

Create one adapter per intended owner and dispose it when that owner finishes. Do not create adapters during rendering. For SSR, create and initialise the instance and adapter per request, then dispose the adapter on request completion. See the [checked setup and disposer](../localisation/i18next#install-and-configure-the-application) and [Nuxt plugin](../nuxt#manual-i18next-plugin).

## `paraglideMessages`

Import `paraglideMessages` from `@verific/paraglide`. Signature:

```ts
function paraglideMessages<
  const Messages extends Readonly<Record<string, unknown>>,
>(
  messages: Messages & ParaglideFunctionMap<Messages>,
  options: ParaglideMessagesOptions<ParaglideMapLocale<Messages>>,
): DiagnosticMessageAdapter

interface ParaglideMessagesOptions<Locale extends string>
  extends CatalogueMessagesOptions {
  readonly locale: () => Locale
}
```

Both arguments are required. `messages` explicitly maps catalogue keys to statically imported Paraglide 2 generated functions. The exported `ParaglideFunctionMap<Messages>` preserves each function's concrete arguments and string return; `ParaglideMapLocale<Messages>` derives the accepted locale type from their locale options. `ParaglideMessagesOptions` is also exported.

The required `locale()` getter supplies one locale per resolution. Read a Vue ref or computed value in the getter to update displayed errors reactively. Remaining options have the [shared defaults](./catalogue-messages#options-and-related-types). The adapter passes semantic values as generated function inputs, adds `count` only when the semantic issue supplies it, and always passes the selected locale explicitly.

Returns the core diagnostic adapter, with no disposer or additional listeners. It neither discovers exports nor selects an ambient locale. The caller owns the map and locale source; create mutable locale state and the adapter within each SSR application or request. See the [checked generated-function setup](../localisation/paraglide#install-and-configure-the-application) and [Nuxt state example](../nuxt#manual-paraglide-plugin).
