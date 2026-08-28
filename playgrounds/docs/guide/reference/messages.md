---
outline: deep
---

# Message resolution

Verific keeps validation information structured until a caller asks for an error string. This reference covers semantic issue descriptions, resolver precedence and diagnostic adapters. Start with the [localisation adapters overview](/guide/localisation), then choose [Vue I18n](/guide/localisation/vue-i18n), [i18next](/guide/localisation/i18next), [Paraglide](/guide/localisation/paraglide) or a [custom catalogue driver](/guide/localisation/custom-adapters).

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

```ts
const { validate, errorsFor } = useValidation(schema, form, {
  messages: ({ identifier, values }) => {
    const format = catalogue.get(identifier)
    return format?.(values)
  },
})
```

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

An adapter that needs missing-key diagnostics implements the structured form:

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

`attempt` remains available for existing adapters; catalogue adapters return the complete ordered `attempts`. Core appends attempts in resolver and array order while continuing through lower-precedence resolvers. If a later resolver succeeds, no diagnostic is emitted. If all resolvers miss, only the highest-precedence adapter that owns `onMissing` is notified. Its diagnostic receives the resolved path, identifier, prefix and the flat key-and-locale history across the complete chain. Duplicates are preserved because they describe real lookups.

## Catalogue adapters

```ts
createCatalogueMessages(driver, options)
```

`@verific/i18n` implements the shared catalogue behaviour used by all first-party adapters. A driver supplies the current locale chain and one atomic exact lookup:

```ts
interface CatalogueMessageDriver {
  readonly locales: () => readonly string[]
  readonly lookup: (
    key: string,
    locale: string,
    context: MessageContext,
  ) => { resolved: true, message: string } | { resolved: false }
}
```

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `fallbackPrefix` | `string` | none | Shared catalogue namespace, for example `errors` |
| `missing` | `'silent' \| 'warn' \| 'throw' \| callback` | warn outside production; silent in production | Final missing-key policy |
| `key` | `(context) => readonly string[]` | default candidates | Replaces the ordered key list |

### Default keys

For a message prefix `forms.signup`, resolved path `['email']` and identifier `invalidEmail`, a catalogue adapter tries:

1. `forms.signup.email.invalidEmail`
2. `{fallbackPrefix}.invalidEmail`, when configured

Core then returns the original schema text if the complete resolver chain misses.

The field key is omitted when `messagePrefix` is absent. Only an empty resolved path omits the path segment. String and number segments are dot-joined without escaping; another segment type skips the field key. Use `key` for dotted property names, symbols or a different catalogue layout.

The custom key callback receives the `MessageContext`, `fallbackPrefix` and `defaultKeys`. Its result replaces the defaults; return `[]` to skip this adapter's lookup.

### Lookup behaviour

Catalogue resolution:

- tries every locale for the first candidate before moving to the next key;
- removes duplicate candidates and locales without changing first occurrence order;
- treats a resolved empty string as a real message;
- passes `values` and optional `count` to the native adapter;
- preserves the schema message as the final fallback.

The atomic `lookup()` result distinguishes a translation whose text equals its key from a miss and prevents resource changes between separate existence and translation calls.

### Missing keys

Missing diagnostics run only after key fallback, locale fallback and the complete resolver chain fail. Reports are deduplicated per adapter instance and exact locale/key pair using a finite cache. Eviction bounds memory; it does not guarantee a warning appears only once for the application's lifetime. Explicit `missing: 'silent'` also prevents a lower-precedence adapter from warning about the same final miss. Use `missing: 'throw'` in exercised tests or build-render checks.

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

Vue I18n local Composers must set `fallbackRoot = false`. i18next adapters react to language, load and resource-store events. Paraglide adapters require an explicit key-to-generated-function map and never discover exports dynamically. The dedicated adapter guides contain copy-ready setup and SSR examples.
