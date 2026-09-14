---
outline: deep
---

# `createCatalogueMessages`

This factory from `@verific/i18n` turns an exact catalogue driver into a core [`DiagnosticMessageAdapter`](./messages#diagnostic-adapters). The [first-party locale factories](./locale-adapters) already use it; implement a driver only for another catalogue.

## Signature and driver

Signature; the catalogue types below are exported from `@verific/i18n`, and `MessageContext` and `DiagnosticMessageAdapter` from `@verific/core`:

```ts
function createCatalogueMessages(
  driver: CatalogueMessageDriver,
  options?: CatalogueMessagesOptions,
): DiagnosticMessageAdapter

interface CatalogueMessageDriver {
  readonly locales: () => readonly string[]
  readonly lookup: (
    key: string,
    locale: string,
    context: MessageContext,
  ) => CatalogueLookupResult
}

type CatalogueLookupResult
  = | { readonly resolved: true, readonly message: string }
    | { readonly resolved: false }
```

`locales()` reads the current ordered locale chain on every resolution. `lookup()` synchronously resolves one exact key and locale; the driver must not introduce another locale fallback. It receives [semantic interpolation values and an optional count](./messages#messagecontext). A resolved empty string, or text equal to its key, is still a successful lookup. Driver exceptions propagate to the caller reading the error.

## Options and related types

`options` defaults to `{}`. `CatalogueMessagesOptions` has these optional properties:

| Option | Type | Default |
| --- | --- | --- |
| `fallbackPrefix` | `string` | absent |
| `missing` | `MissingMessageMode` | `'warn'` outside production; `'silent'` in production |
| `key` | `(context: CatalogueKeyContext) => readonly string[]` | generated candidates |

`MissingMessageMode` is `'silent' \| 'warn' \| 'throw' \| ((diagnostic: CatalogueMissingMessageDiagnostic) => void)`. `CatalogueKeyContext` extends [`MessageContext`](./messages#messagecontext) with optional `fallbackPrefix` and readonly `defaultKeys`. `CatalogueMissingMessageDiagnostic` extends the core missing diagnostic with optional `fallbackPrefix`. All three are exported from `@verific/i18n`.

## Keys and fallback

With `messagePrefix: 'forms.signup'`, path `['email']`, identifier `invalidEmail` and `fallbackPrefix: 'errors'`, default candidates are:

1. `forms.signup.email.invalidEmail`;
2. `errors.invalidEmail`.

Every locale is tried for one key before moving to the next key. Duplicate keys and locales are removed while preserving their first occurrence. Without `messagePrefix`, no field candidate is generated; without `fallbackPrefix`, no shared candidate is generated.

String and number path segments are dot-joined without escaping. Another segment type skips the field candidate; an empty path adds no path segment. A custom `key` function replaces the complete candidate list. Include its `defaultKeys` to retain defaults, or return `[]` to skip catalogue lookups.

## Example

<<< ../examples/api/catalogue-messages.ts

Pass the returned `messages` to [`createVerific({ messages })`](./create-verific) or a `useValidation` call. Updating the returned locale ref changes derived error text without rerunning the schema.

## Return value, diagnostics and lifetime

The return value exposes synchronous `resolve(context)` and `onMissing(diagnostic)`. A miss records ordered key/locale attempts for core to combine with later resolvers. Only after the [complete resolver chain](./messages#resolver-precedence) fails does core call the highest-precedence adapter that contributed attempts and has `onMissing`. Final schema fallback belongs to core, not to `resolve()` itself.

Warnings and callbacks deduplicate exact locale/key pairs with a finite per-instance cache. `missing: 'silent'` suppresses reporting; `'throw'` throws whenever core reports a final miss. Returning no candidates skips both lookup and this adapter's diagnostic ownership. Because resolution is lazy, strict checks must read an error selector after validating. See [diagnostic adapters](./messages#diagnostic-adapters) for the shared diagnostic types.

The factory creates no locale watcher or external listener and has no disposer. The caller owns its driver and locale state, including any driver-specific cleanup. For SSR, create mutable locale state and the adapter per request or application; do not share the reporting cache and mutable driver across requests.
