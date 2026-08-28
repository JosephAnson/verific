## Context

See [proposal.md](./proposal.md) for motivation. Today, `createValidationScope()` owns a registration map and `useValidate()` joins it. The core plugin is required only as an installation guard, validation failures expose raw Standard Schema issues, transformed values are discarded, and message strings come directly from schemas. The Nuxt module installs `createVerific()` without options and has no locale integration.

The existing validation runner already provides valuable guarantees around deep input snapshots, concurrent validators, newest-run authority, disposal and late promise handling. This design changes the public and state models while retaining those guarantees.

Standard Schema guarantees a vendor, a validator and issues containing a message plus an optional path. It does not guarantee a portable issue code or interpolation metadata. Locale-library integration must therefore sit behind Verific's own issue-description and message-resolution boundaries.

## Goals / Non-Goals

**Goals:**

- Make the common root form one `useValidation(schema, model)` call.
- Preserve scope-only orchestration and independent nested forms without a separate public scope composable.
- Keep aggregate scope state and registration-specific output unambiguous.
- Make localised message arrays available directly to existing field components.
- Keep schemas, validation vendors and locale libraries independently replaceable.
- Bind Nuxt locale state per application/request.

**Non-Goals:**

- Owning field values, touched/dirty state, submission state or input registration.
- Adding a Verific validation-rule DSL.
- Requiring a validation-message rendering component.
- Shipping i18next or Paraglide adapters in this change.
- Adding an ESLint package, build-time catalogue inference or devtools integration.
- Automatically translating field labels or changing grammar such as lower-casing labels.

## Decisions

### 1. `useValidation` is both the scope and registration facade

The public contract will be shaped as follows:

```ts
type ValidationPath<Schema extends StandardSchemaV1 = StandardSchemaV1> =
  | (StandardSchemaV1.InferInput<Schema> extends object
    ? keyof StandardSchemaV1.InferInput<Schema>
    : PropertyKey)
  | readonly PropertyKey[]

interface ValidationScopeOptions {
  readonly scope?: 'new'
  readonly messages?: MessageResolver
  readonly messagePrefix?: string
  readonly describeIssue?: IssueNormaliser
}

interface ValidationOptions extends ValidationScopeOptions {
  readonly at?: readonly PropertyKey[]
}

type ValidationResult =
  | { readonly success: true; readonly issues: readonly ValidationIssue[] }
  | { readonly success: false; readonly issues: readonly ValidationIssue[] }

interface ValidationGroup<
  Path = PropertyKey | readonly PropertyKey[],
> {
  readonly issues: ComputedRef<readonly ValidationIssue[]>
  readonly errors: ComputedRef<readonly string[]>
  readonly isValidating: ComputedRef<boolean>
  issuesFor(path: Path): readonly ValidationIssue[]
  hasError(path: Path): boolean
  errorsFor(path: Path): readonly string[]
  errorFor(path: Path): string | undefined
  validate(): Promise<ValidationResult>
}

function useValidation(options?: ValidationScopeOptions): ValidationGroup

function useValidation<Schema extends StandardSchemaV1>(
  schema: MaybeRef<Schema>,
  model: ValidationData<Schema>,
  options?: ValidationOptions,
): ValidationController<Schema>

type RegistrationResult<Output> =
  | { readonly status: 'idle' }
  | { readonly status: 'valid'; readonly value: Output }
  | { readonly status: 'invalid'; readonly issues: readonly ValidationIssue[] }

interface ValidationController<Schema extends StandardSchemaV1>
  extends ValidationGroup<ValidationPath<Schema>> {
  readonly ownIssues: ComputedRef<readonly ValidationIssue[]>
  readonly result: Readonly<ShallowRef<
    RegistrationResult<StandardSchemaV1.InferOutput<Schema>>
  >>
}
```

A default call first reads the state provided by its own component and then the nearest injected state. If neither exists, it creates and provides a scope. `scope: 'new'` always creates a scope. This preserves same-component composition and lets a scope-only parent call argumentless `useValidation()`.

Options on a call that creates a scope become that scope's resolver, prefix and normaliser defaults and apply once to its own registration. Options on a schema registration that joins a scope apply to that registration only. An argumentless joining call accepts no policy options; supplying them throws rather than mutating an existing scope implicitly. `at` is always registration-local and never inherited.

Every controller exposes aggregate `issues`, `errors`, `isValidating`, selectors and scope-wide `validate()`. Schema-bound controllers additionally expose `ownIssues` and their own discriminated `result`. A failed aggregate result may contain an empty issue array because Standard Schema permits `issues: []` as a failure.

This avoids making `issues` mean “aggregate” at a root and “local” in a descendant. It also avoids pretending unrelated transformed outputs can be merged into one form value.

Alternative considered: retain `createValidationScope()` or introduce `useForm()`. Both preserve ceremony and create two concepts for one composition mechanism. Compatibility aliases are also rejected because their implicit-scope behaviour would not actually be compatible.

### 2. `createVerific` becomes optional application configuration

Core validation will not require a Vue plugin. If installed, `createVerific(options)` provides application-wide message and issue-description defaults:

```ts
interface VerificOptions {
  readonly messages?: MessageResolver
  readonly describeIssue?: IssueNormaliser
}

function createVerific(options?: VerificOptions): Verific
```

With no plugin, scopes validate normally and expose original issue messages.

This gives `createVerific` a concrete role without coupling scope lifetime to application installation. Nuxt continues to install it automatically unless `global: false` is configured.

### 3. Scope state is immutable at commit boundaries

An internal scope owns ordered registrations and one shallow reactive committed-state object. Controllers derive their own result by registration ID. A completed validation stages all active registration results and replaces the committed scope state once, preventing consumers from observing half of a multi-registration commit.

Each run captures schema, model snapshot, registration prefix and issue-description policy synchronously, invokes validators concurrently and preserves registration order when collecting results. A Standard Schema result is a failure when `result.issues !== undefined`, including an empty list; `{ value, issues: undefined }` remains successful. Throws and rejected promises reject the aggregate run without committing partial results.

The current cancellation-signal approach remains appropriate, with unsubscribeable listeners for run supersession and disposal. Older callers adopt the latest promise. Disposed registrations are removed immediately and abandoned validator promises retain rejection handlers.

Alternative considered: keep separate mutable issue refs per registration. That is simpler internally but permits synchronous Vue observers to see partial commits and start validation from an intermediate state.

### 4. Public issues use a lossless envelope

```ts
interface ValidationIssue {
  readonly raw: StandardSchemaV1.Issue
  readonly vendor: string
  readonly message: string
  readonly localPath: readonly PropertyKey[]
  readonly path: readonly PropertyKey[]
  readonly semantic?: SemanticIssue
}
```

`raw` retains object identity. `localPath` normalises Standard Schema `{ key }` segments; `path` prepends the registration's `at` option. The supplied value passed to the schema is not nested or changed by `at`.

Internally and publicly, canonical paths remain arrays. A string selector means one property key, not a dot-path parser. A controller resolves selector paths relative to its own registration prefix and matches exactly. This prevents an `address` field error from silently including every issue under `address`.

Alternative considered: mutate or clone raw issues with absolute paths. That loses identity and can break rich vendor issue objects such as callable schemas or class instances.

### 5. Issue normalisation and message translation are separate layers

```ts
interface SemanticIssue {
  readonly identifier: string
  readonly values: Readonly<Record<string, string | number | boolean | null>>
  readonly count?: number
}

interface ValidationIssueContext {
  readonly raw: StandardSchemaV1.Issue
  readonly vendor: string
  readonly message: string
  readonly localPath: readonly PropertyKey[]
  readonly path: readonly PropertyKey[]
  readonly input: {
    readonly present: boolean
    readonly value: unknown
  }
}

type IssueNormaliser = (issue: ValidationIssueContext) => SemanticIssue | undefined
```

Core will contain guarded, dependency-free normalisers selected from the Standard Schema vendor and native issue shape. The normaliser context resolves presence and value from the run's captured input at `localPath`; it is never copied automatically into semantic values, message contexts, diagnostics or logs. The normative vocabulary and value shapes live in the message-resolution spec. `required` is emitted for an unresolved/missing value or an explicit `undefined`; `null` and other present wrong-type values use `invalidType`. Unknown and changed vendor shapes remain undescribed and use `invalid` only as a lookup fallback.

Normaliser order is registration, root scope, application, built-in, then unknown. Returning `undefined` continues; repeated function identity is skipped. Registration and application failures surface as configuration errors, while a built-in guard failure degrades to unknown. A scope-creating call establishes the root normaliser and applies it once to its own registration; a joining call's hook is registration-only and an independent new scope discards the outer root hook.

The initial mapping guarantee is intentionally narrow:

| Validator | Guaranteed range | Pinned fixture |
| --- | --- | --- |
| Zod | `>=4.4 <5` | `4.5.1` |
| Valibot | `>=1.4 <2` | `1.4.2` |

Other Standard Schema vendors, including ArkType, continue to validate but use a custom normaliser or raw-message fallback until a separately tested mapping is added. Normalisers never parse message prose or spread raw issues/model values into translation parameters.

This stable semantic vocabulary is a public versioned contract. It is more work than exposing vendor codes, but it lets a catalogue survive a schema-library migration and keeps locale adapters free of validation-vendor logic.

### 6. Message resolution is lazy and resolver chains retain ownership

```ts
interface MessageContext {
  readonly issue: ValidationIssue
  readonly path: readonly PropertyKey[]
  readonly identifier: string
  readonly values: Readonly<Record<string, string | number | boolean | null>>
  readonly count?: number
  readonly messagePrefix?: string
  readonly defaultMessage: string
}

type MessageResolution =
  | { readonly resolved: true; readonly message: string }
  | {
    readonly resolved: false
    readonly attempt?: MissingMessageAttempt
  }

type MessageResolverFunction
  = (context: MessageContext) => string | undefined

interface MissingMessageAttempt {
  readonly locale?: string
  readonly keys: readonly string[]
}

interface MissingMessageDiagnostic {
  readonly issue: ValidationIssue
  readonly messagePrefix?: string
  readonly path: readonly PropertyKey[]
  readonly identifier: string
  readonly attempts: readonly MissingMessageAttempt[]
}

interface DiagnosticMessageAdapter {
  resolve(context: MessageContext): MessageResolution
  onMissing?(diagnostic: MissingMessageDiagnostic): void
}

type MessageResolver = MessageResolverFunction | DiagnosticMessageAdapter
```

Structured issues are committed; translated strings are not. `errors`, `errorsFor()` and `errorFor()` resolve during computed/render evaluation, so reactive locale dependencies update output without validation.

Each registration records its effective scope prefix and resolver chain. Resolution order is registration override, root-scope resolver, application resolver, then `issue.message`, with identical resolver objects/functions invoked once. A scope-creating call's options become root policy and apply once to its own registration. Options on a joining registration are local to that registration and do not become defaults for deeper descendants. `scope: 'new'` resets to application defaults. This ownership remains attached when a child issue appears in aggregate root errors.

Core collects unresolved adapter attempts while preserving each attempt's locale. If every resolver fails, it invokes only the highest-precedence attempted adapter with an `onMissing` handler. A built-in `silent` adapter installs a no-op handler, so it deliberately suppresses lower-precedence warnings; otherwise the selected adapter owns per-instance deduplication. Plain custom resolver functions retain the simple `string | undefined` API and do not need to implement diagnostics. Empty strings are treated as resolved, and resolver or missing-callback errors surface.

Calling `errorsFor()` or `errorFor()` in a template or computed is reactive; assigning either returned value once during setup is intentionally a snapshot. Documentation will show `computed(() => validation.errorsFor('email'))` and the corresponding singular form for script-side retention.

Alternative considered: commit translated messages during validation. That requires revalidation on locale changes and mixes presentation state into validator lifecycle state.

### 7. Vue I18n ships as an adapter package

A new `@verific/vue-i18n` package will export:

```ts
interface VueI18nKeyContext extends MessageContext {
  readonly fallbackPrefix?: string
  readonly defaultKeys: readonly string[]
}

vueI18nMessages(composer, {
  fallbackPrefix?: string
  missing?: 'silent' | 'warn' | ((diagnostic) => void)
  key?: (context: VueI18nKeyContext) => readonly string[]
})
```

The default key candidates are:

```text
{messagePrefix}.{resolvedPath}.{identifier}
{fallbackPrefix}.{identifier}
```

Candidates with an absent prefix are skipped. The field candidate uses the resolved path, so a pathless issue at registration prefix `['shipping']` still produces `...shipping.{identifier}`; only an empty resolved path produces `{messagePrefix}.{identifier}`. String and number segments are dot-joined without escaping. Other segments proceed to global/raw fallback, and dotted property names require a custom key builder. When supplied, `key()` receives the ordered defaults and replaces them with its returned ordered list; an empty list skips dictionary lookup for that adapter.

Vue I18n owns locale fallback, interpolation and pluralisation. Catalogue existence, rather than `t(key) === key`, decides whether a value exists. The adapter accepts a Vue I18n 11 Composition API global or local Composer and owns its diagnostic cache; legacy-mode `VueI18n` instances are outside this first adapter contract. It searches the supplied Composer's own locale chain explicitly. A local Composer used as an override must have its public `fallbackRoot` property set to `false` by the caller before it is supplied; otherwise the adapter fails with an actionable configuration error, because Vue I18n 11 inherits this setting from the root and its implicit root shortcut would bypass higher-precedence inherited Verific resolvers. The inherited application adapter provides global catalogue fallback instead. The adapter never calls `useI18n()` internally or mutates the caller's Composer, so a captured caller-owned Composer remains valid outside component setup and cannot be associated with another application's ambient instance.

`@verific/vue-i18n` peers on the matching `@verific/core` release and `vue-i18n >=11.4 <12`. Core depends only on its resolver types. Namespace-oriented and generated-function-map fakes test that the resolver boundary does not assume Vue I18n. Future i18next and Paraglide packages can therefore expose different configuration surfaces without being part of this change.

Alternative considered: bundle Vue I18n into core. That makes a presentation library part of every consumer's dependency and encourages future adapters to share a configuration model that does not fit them.

### 8. Missing translations are runtime-observable, not statically promised

With `missing` omitted, the adapter warns when `process.env.NODE_ENV !== 'production'` and remains silent in production. A warning/callback is emitted only when the full resolver chain falls back to the raw issue message. Diagnostics retain each attempted locale with its keys plus the prefix, resolved path and identifier, and are deduplicated per adapter instance, locale and logical key. Explicit silent mode installs a no-op final handler so lower-precedence adapters do not warn.

Dynamic form prefixes, paths and runtime validator outcomes cannot be proven exhaustively by ESLint. Consumers can use Vue I18n's native catalogue typing/parity checks, while a strict missing callback turns exercised validation paths into test failures.

### 9. Nuxt selects adapters statically and binds them at runtime

The Nuxt option remains serialisable:

```ts
interface VueI18nModuleMessages {
  readonly adapter: 'vue-i18n'
  readonly fallbackPrefix?: string
  readonly missing?: 'warn' | 'silent'
}

type ModuleOptions =
  | {
    readonly global?: true
    readonly messages?: false | VueI18nModuleMessages
  }
  | {
    readonly global: false
    readonly messages?: never
  }
```

The default is `global: true` and `messages: false`. Module setup rejects the conflicting manual/message combination at runtime for JavaScript consumers. It writes selected static options to a generated build template and adds the Verific runtime plugin with Nuxt's numeric plugin order after default module plugins. The Vue I18n variant also declares `dependsOn: ['i18n:plugin']`, so it waits for Nuxt I18n when that plugin uses parallel asynchronous setup; the explicit runtime guard remains. Static options do not enter public runtime config.

For each Nuxt application, the runtime plugin reads the Composition API Composer from `nuxtApp.$i18n`, creates `vueI18nMessages()` and passes it to a new `createVerific()` instance. No resolver, Composer, locale or diagnostic cache exists at module scope. A missing `$i18n` or legacy-mode instance produces an actionable startup error only when the adapter was selected.

`global: false` adds no runtime plugin and performs no locale check, but retains the `useValidation` auto-import. This is the escape hatch for i18next, Paraglide, non-serialisable key builders and other manual application configuration.

`@verific/nuxt` treats `@verific/vue-i18n` and `@nuxtjs/i18n` as optional peers. Module generation imports `@verific/vue-i18n` only for the selected adapter; the ordinary plugin imports core alone. This keeps a localisation-disabled packed consumer free of locale dependencies while producing a clear build-time error when selected peers are missing.

The module's peer and compatibility range is narrowed to Nuxt `>=3.21 <5`. Automatic Vue I18n integration supports Nuxt I18n `>=10.6 <11` and Vue I18n `>=11.4 <12`, with pinned fixtures at Nuxt 3.21.11, Nuxt 4.5.2, Nuxt I18n 10.6.0 and Vue I18n 11.4.10. Numeric order, `dependsOn` and the runtime guard cover ordinary and parallel Nuxt I18n setup. Both module declaration orders are exercised.

## Risks / Trade-offs

- **[Semantic mappings drift as validators evolve]** → Use structural guards, supported-version fixtures and unknown/raw fallback; never let a built-in normaliser guard failure fail validation. Errors from application hooks remain visible.
- **[Implicit scopes make nested form boundaries less visible]** → Keep `scope: 'new'` explicit and document that default calls join the nearest scope.
- **[Aggregate issues plus local results can still be misunderstood]** → Use `issues`/`ownIssues` naming consistently and document the contract on every controller.
- **[Dynamic translation keys cannot be statically exhaustive]** → Combine native locale catalogue checks, deduplicated runtime diagnostics and a strict callback for tests.
- **[Translation methods returning arrays can be captured non-reactively]** → Resolve in `errors` computed values and document render/computed usage for selector methods.
- **[SSR state could leak between requests]** → Construct plugins, adapters and diagnostic caches inside each Vue/Nuxt application instance and add concurrent SSR tests.
- **[A new adapter package increases release coordination]** → Keep it small, peer-based and independently testable; package/consumer smoke tests cover all linked tarballs.
- **[Removing two exports is disruptive]** → Make one pre-1.0 breaking release with a focused migration guide rather than carrying misleading aliases.

## Migration Plan

1. Add the new issue, scope and resolver types behind tests while the old API still exists internally.
2. Implement `useValidation()` and migrate core tests and playgrounds.
3. Remove `createValidationScope()` and `useValidate()` from the public entry point in the same pre-1.0 breaking release.
4. Add `@verific/vue-i18n`, then wire the Nuxt option and request-local runtime integration.
5. Replace all documentation examples with the new form and message APIs and publish an old-to-new migration table.
6. Verify packed Vue, Nuxt 3 and Nuxt 4 consumers before release. A rollback restores the previous public exports and documentation together; mixed old/new public examples are not supported.
