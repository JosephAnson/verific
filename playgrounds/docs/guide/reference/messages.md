---
outline: deep
---

# Message resolution

Verific keeps validation information structured until a caller asks for an error string. This page explains that contract and resolver precedence. For setup, start with [localisation adapters](/guide/localisation). For factory parameters and lifetimes, use [`createVerific`](./create-verific), [`createCatalogueMessages`](./catalogue-messages) or the [locale adapter references](./locale-adapters).

## Pipeline

```text
Standard Schema issue
  → ValidationIssue
  → SemanticIssue { identifier, values, count? }
  → MessageResolver
  → error string
```

- An **issue** is structured validation information.
- A **semantic identifier** describes locale-independent meaning such as `invalidEmail`.
- A **message resolver** turns that meaning into a ready-to-render error string.
- A **locale adapter** is a resolver implemented for a particular locale library.

`issues` and `issuesFor()` expose structured issues. `errors`, `errorsFor()` and `errorFor()` resolve strings lazily and preserve issue order and duplicates.

## `ValidationIssue`

| Property | Type | Meaning |
| --- | --- | --- |
| `raw` | `StandardSchemaV1.Issue` | Original issue, preserved by identity |
| `vendor` | `string` | Standard Schema vendor |
| `message` | `string` | Original schema error text |
| `localPath` | `readonly PropertyKey[]` | Path reported by this registration's schema |
| `path` | `readonly PropertyKey[]` | Resolved scope path, including `at` |
| `semantic` | `SemanticIssue \| undefined` | Portable description when recognised |

When no resolver succeeds, `message` is returned unchanged.

## `SemanticIssue`

```ts
interface SemanticIssue {
  readonly identifier: string
  readonly values: Readonly<Record<string, string | number | boolean | null>>
  readonly count?: number
}
```

`identifier` is the catalogue-independent meaning. `values` contains explicit interpolation values; `count` lets locale adapters apply pluralisation. Verific does not parse schema prose or copy model values into this object.

### Built-in identifiers

Guarded normalisers cover the supported Zod and Valibot versions:

| Identifier | Meaning | Values | Count |
| --- | --- | --- | --- |
| `required` | Missing or explicitly `undefined` input | none | none |
| `invalidType` | Present input has the wrong type | optional `expected` | none |
| `invalidEmail` | Invalid email format | none | none |
| `invalidUrl` | Invalid URL format | none | none |
| `minLength` | String or array is too short | `minimum` | `minimum` |
| `maxLength` | String or array is too long | `maximum` | `maximum` |
| `minimum` | Number is below its bound | `minimum`, `inclusive` | none |
| `maximum` | Number is above its bound | `maximum`, `inclusive` | none |
| `pattern` | Regular expression mismatch | none | none |
| `invalidDate` | Invalid `Date` value | none | none |

If no custom or built-in normaliser recognises an issue, it has no `semantic` value. Resolvers receive the lookup identifier `invalid`, but raw issue data and the schema fallback text remain intact.

## `IssueNormaliser`

```ts
type IssueNormaliser = (
  issue: ValidationIssueContext,
) => SemanticIssue | undefined
```

The context contains:

| Property | Meaning |
| --- | --- |
| `raw` | Original Standard Schema issue |
| `vendor` | Schema vendor |
| `message` | Original schema error text |
| `localPath` | Schema-local normalised path |
| `path` | Resolved scope path |
| `input.present` | Whether the path existed in the captured input |
| `input.value` | Captured value at that path |

Return a semantic description when recognised or `undefined` to continue. Normaliser order is:

1. registration `describeIssue`;
2. root-scope `describeIssue`;
3. application `createVerific({ describeIssue })`;
4. built-in Zod and Valibot descriptions.

Identical function instances run at most once per issue.

## `MessageResolver`

The simplest resolver is a synchronous function:

```ts
type MessageResolverFunction = (
  context: MessageContext,
) => string | undefined
```

Return a string when resolved. An empty string counts as resolved. Return `undefined` to continue the resolver chain; thrown errors surface to the caller.

The [checked `createVerific` example](./create-verific#install) installs a function resolver. The same resolver can be supplied to a registration's `messages` option.

### `MessageContext`

| Property | Meaning |
| --- | --- |
| `issue` | Complete `ValidationIssue` |
| `path` | Resolved issue path |
| `identifier` | Semantic identifier, or `invalid` when undescribed |
| `values` | Explicit interpolation values, or an empty object |
| `count` | Optional plural count |
| `messagePrefix` | Effective form or scope prefix |
| `defaultMessage` | Original schema error text |

### Resolver precedence

For each issue, core tries:

1. registration `messages`;
2. root-scope `messages`;
3. application `createVerific({ messages })`;
4. `defaultMessage` from the schema.

A schema-bound call that creates a scope installs its options as root policy; they are not invoked twice for its own issue. A joining registration's options apply only to that registration. `{ scope: 'new' }` resets inherited policy and retains only application defaults.

## Diagnostic adapters

An adapter that needs missing-key diagnostics implements the structured form. These types are exported from `@verific/core`; this is a type signature:

```ts
interface DiagnosticMessageAdapter {
  resolve: (context: MessageContext) =>
    | { resolved: true, message: string }
    | {
      resolved: false
      attempt?: { locale?: string, keys: readonly string[] }
      attempts?: readonly { locale?: string, keys: readonly string[] }[]
    }
  onMissing?: (diagnostic: MissingMessageDiagnostic) => void
}
```

`MessageResolver` is the union of `MessageResolverFunction` and `DiagnosticMessageAdapter`. `MessageResolution` names the return union above; `MissingMessageAttempt` names one locale/key attempt, and `MissingMessageDiagnostic` contains `messagePrefix?`, `path`, `identifier` and readonly `attempts`.

`attempt` remains available for existing adapters; catalogue adapters return the complete ordered `attempts`. Core appends attempts in resolver and array order while continuing through lower-precedence resolvers. If a later resolver succeeds, no diagnostic is emitted. If all resolvers miss, the highest-precedence adapter with both contributed attempts and `onMissing` is notified. Its diagnostic includes the flat key-and-locale history across the complete chain. Duplicates describe real lookups and are preserved.

## Catalogue adapters

[`createCatalogueMessages`](./catalogue-messages) implements the shared behaviour used by all first-party locale adapters. Its driver supplies the current locale chain and one exact key/locale lookup; its options control shared keys, custom candidates and missing diagnostics. See the focused reference for [the driver signature](./catalogue-messages#signature-and-driver) and [option types and defaults](./catalogue-messages#options-and-related-types).

### Default keys

For a message prefix `forms.signup`, resolved path `['email']` and identifier `invalidEmail`, a catalogue adapter tries:

1. `forms.signup.email.invalidEmail`
2. `{fallbackPrefix}.invalidEmail`, when configured

Core then returns the original schema text if the complete resolver chain misses.

The field key is omitted without a message prefix. Use a custom `key` callback for dotted property names, symbols or another catalogue layout. See [keys and fallback](./catalogue-messages#keys-and-fallback) for path conversion and candidate replacement.

### Lookup behaviour

Catalogue resolution tries every locale for one candidate before moving to the next key, removes duplicate keys/locales and accepts a resolved empty string. An exact lookup must distinguish a missing translation from text that happens to equal its key. Native formatting belongs to the [locale adapter](./locale-adapters); the final schema fallback belongs to core.

### Missing keys

Missing diagnostics run only after key fallback, locale fallback and the complete resolver chain fail. An adapter with `missing: 'silent'` and contributed attempts prevents a lower-precedence adapter from warning about the same final miss. Warn/callback reports use a finite deduplication cache; `'throw'` throws whenever core reports a final miss. See [diagnostics and lifetime](./catalogue-messages#return-value-diagnostics-and-lifetime).

Because resolution is lazy, tests must read `errors`, `errorsFor()` or `errorFor()` after validation to exercise a key. Static catalogue typing and locale-parity checks complement this runtime coverage; they cannot prove dynamic prefixes, paths or validation outcomes.

## Reactive locale state

Resolver output is not committed during validation. It is recalculated when a computed value or render reads the error selectors. A resolver may therefore read a locale ref or Composer and update displayed strings without rerunning the schema.

Calling `errorsFor()` once in script stores a snapshot. Wrap it in `computed(() => errorsFor('email'))` when retaining it outside a render.

## First-party adapter differences

| Adapter | Locale source | Native behaviour retained | Lifecycle |
| --- | --- | --- | --- |
| `vueI18nMessages()` | supplied Composition Composer | locale fallback, interpolation and pluralisation | Composer/application owned |
| `i18nextMessages()` | supplied i18next 26 instance | configured namespace fallback and interpolation | call `dispose()` at the owning application or request boundary |
| `paraglideMessages()` | required locale getter | concrete generated function signatures | locale source and adapter are application/request owned |

Vue I18n local Composers must set `fallbackRoot = false`. i18next adapters react to language, load and resource-store events. Paraglide adapters require an explicit key-to-generated-function map. The [factory reference](./locale-adapters) covers exact parameters, related exported types and disposal; the [integration guides](../localisation) provide checked setup and SSR examples.
