## Purpose

Define how structured validation issues become ready-to-render localised messages without coupling schemas or core validation to one locale library.

## ADDED Requirements

### Requirement: Semantic issue descriptions are independent of prose
Verific SHALL describe recognised validator issues with a stable semantic identifier and an explicitly selected set of interpolation values. A normaliser SHALL receive raw issue metadata plus presence and value resolved from the validation run's captured input. Verific SHALL preserve the raw issue, SHALL NOT derive identifiers or values by parsing `issue.message`, and SHALL NOT automatically forward captured input into messages, interpolation values, diagnostics or logs.

#### Scenario: Recognised built-in issue
- **WHEN** a supported validator reports a recognised email-format issue
- **THEN** Verific describes it with `invalidEmail` independently of the issue's human-readable message

#### Scenario: Unknown issue
- **WHEN** no built-in or application issue normaliser recognises an issue
- **THEN** the issue remains semantically unknown and message lookup uses `invalid` without treating the prose message as an identifier

#### Scenario: Custom issue normaliser
- **WHEN** an application normaliser describes a custom issue as `notAfterDate` with `{ max: 5 }`
- **THEN** that identifier and only those selected values are available to message resolvers

### Requirement: Built-in normalisers use a documented cross-vendor vocabulary
Verific SHALL provide guarded normalisers for the tested Zod 4 and Valibot 1 ranges and map equivalent recognised constraints to this initial versioned vocabulary. Other Standard Schema vendors SHALL continue to validate and use custom normalisation or raw-message fallback.

| Identifier | Meaning | Canonical values | Plural count |
| --- | --- | --- | --- |
| `required` | The resolved input is missing or explicitly `undefined` | none | none |
| `invalidType` | A present, non-`undefined` input has the wrong type | optional `expected: string` | none |
| `invalidEmail` | A string fails an email-format constraint | none | none |
| `invalidUrl` | A string fails a URL-format constraint | none | none |
| `invalidDate` | The vendor explicitly identifies an invalid date value | none | none |
| `minLength` | A string or array is shorter than an inclusive bound | `minimum: number` | `minimum` |
| `maxLength` | A string or array is longer than an inclusive bound | `maximum: number` | `maximum` |
| `minimum` | A number is below a bound | `minimum: number`, `inclusive: boolean` | none |
| `maximum` | A number is above a bound | `maximum: number`, `inclusive: boolean` | none |
| `pattern` | A string fails a pattern constraint | none | none |

`required` SHALL only be used for a missing or `undefined` value; `null` and other present values of the wrong type SHALL use `invalidType`. Shape changes or unrecognised constraints SHALL degrade to an unknown semantic issue rather than failing validation.

#### Scenario: Equivalent constraints across vendors
- **WHEN** supported Zod and Valibot schemas report equivalent minimum-length failures
- **THEN** both issues use the same `minLength` identifier and expose the same named minimum value

#### Scenario: Wrong type is not missing
- **WHEN** a supported validator receives a present value of the wrong type
- **THEN** the issue uses `invalidType` rather than `required`

#### Scenario: Zod missing and explicit undefined
- **WHEN** the pinned Zod fixture reports the same native type issue for a missing property and an explicitly `undefined` property
- **THEN** the captured input context lets both map to `required`

#### Scenario: Zod null and other wrong types
- **WHEN** the pinned Zod fixture reports that native issue for `null`, a number or another present wrong-type value
- **THEN** the captured input context lets each map to `invalidType`

#### Scenario: Unsupported vendor issue shape
- **WHEN** a vendor issue no longer matches its guarded normaliser
- **THEN** validation continues, the raw issue is preserved and raw-message fallback remains available

### Requirement: Issue normaliser precedence is deterministic
Issue normalisers SHALL run in registration, root-scope, application and built-in order, stopping at the first semantic description. Returning `undefined` SHALL continue the chain. Options on a scope-creating call SHALL establish its root-scope normaliser and apply only once to that registration; options on a joining call SHALL apply only to that registration. A new independent scope SHALL not inherit the outer scope normaliser.

#### Scenario: Registration override
- **WHEN** a registration normaliser describes an issue also recognised by the application or built-in normaliser
- **THEN** the registration description is used and lower-precedence normalisers are not invoked

#### Scenario: Root normaliser inheritance
- **WHEN** a scope-creating call provides a normaliser and a descendant registration does not
- **THEN** the descendant tries that root-scope normaliser before application and built-in normalisers

#### Scenario: Custom normaliser error
- **WHEN** an application or registration normaliser throws
- **THEN** the error is surfaced rather than silently treated as an unknown issue

### Requirement: Core uses a locale-library-neutral resolver contract
Core SHALL resolve messages synchronously from the issue, resolved path, semantic identifier, interpolation values, message prefix and original message. A plain resolver function SHALL return a string when resolved or `undefined` when unresolved. A diagnostic-capable adapter SHALL return either `{ resolved: true, message }` or `{ resolved: false, attempt?: { locale?, keys } }` and MAY provide an `onMissing` handler. An empty string SHALL count as a resolved message.

#### Scenario: Custom locale-library resolver
- **WHEN** an application supplies a resolver for a locale library not shipped by Verific
- **THEN** core uses it without depending on that locale library

#### Scenario: Resolver error
- **WHEN** a resolver throws because of invalid configuration or catalogue data
- **THEN** the error is surfaced rather than silently treated as a missing translation

#### Scenario: Diagnostic attempt
- **WHEN** a diagnostic-capable adapter cannot resolve an issue
- **THEN** core retains that attempt's locale, ordered keys and missing handler while continuing the resolver chain

### Requirement: Resolver defaults and overrides compose predictably
`createVerific({ messages })` SHALL establish an optional application resolver. A registration resolver SHALL take precedence, followed by the root-scope resolver, followed by the application resolver, then the original issue message. Returning an unresolved result SHALL continue the chain, and the same resolver identity SHALL be invoked at most once per issue.

Options on a scope-creating schema call SHALL establish the root-scope policy and apply once to that registration. Options on a joining schema call SHALL be registration-only and SHALL NOT become defaults for deeper descendants. An argumentless call MAY establish policy only when it creates a scope or explicitly creates `scope: 'new'`; passing policy options to an argumentless call that joins an existing scope SHALL throw an actionable configuration error.

#### Scenario: Application default
- **WHEN** a registration has no local resolver and the application resolver resolves its issue
- **THEN** the application message is returned

#### Scenario: Local resolver fallback
- **WHEN** a registration resolver returns `undefined` and the application resolver resolves the issue
- **THEN** the application message is returned before raw-message fallback

#### Scenario: Scope inheritance
- **WHEN** a root validation controller configures a resolver or message prefix and a descendant in the same scope does not
- **THEN** the descendant issue uses the inherited policy

#### Scenario: Scope creator resolver runs once
- **WHEN** the schema-bound call that creates a scope supplies a resolver
- **THEN** that resolver is invoked once for its own issue rather than once as a registration resolver and again as a scope resolver

#### Scenario: Joining registration policy
- **WHEN** a joining descendant supplies its own resolver or prefix
- **THEN** that policy applies only to the descendant registration and is not inherited by deeper registrations

#### Scenario: Argumentless joining policy is rejected
- **WHEN** argumentless `useValidation({ messages })` would join an existing scope
- **THEN** Verific throws an actionable error instead of silently replacing or ignoring scope policy

#### Scenario: Independent nested scope
- **WHEN** a descendant creates `scope: 'new'` without its own resolver or prefix
- **THEN** it uses only application defaults and does not inherit the outer form's message policy

### Requirement: Localised message selectors are ready to render
Every validation controller SHALL expose computed aggregate `errors`, exact-path `errorsFor(path)` and first-message `errorFor(path)`. These selectors SHALL preserve issue ordering and duplicates and SHALL resolve messages lazily from structured issues.

#### Scenario: Field message array
- **WHEN** two issues exist exactly at `['email']`
- **THEN** `errorsFor('email')` returns both resolved strings in source order and `errorFor('email')` returns the first

#### Scenario: No field message
- **WHEN** no issue exists exactly at the requested path
- **THEN** `errorsFor(path)` returns an empty array and `errorFor(path)` returns `undefined`

#### Scenario: Locale change
- **WHEN** validation has produced issues and the active locale changes
- **THEN** `errors` and both selector methods when re-evaluated in a render or computed context use the new locale without invoking the schema again

#### Scenario: Direct selector capture is a snapshot
- **WHEN** the array or string returned by `errorsFor()` or `errorFor()` is assigned once during setup outside a computed context
- **THEN** that captured value remains a snapshot and documentation directs users to wrap either call in `computed()` when retaining it

### Requirement: Dictionary adapters use predictable key fallback
A dictionary-based adapter SHALL try `{messagePrefix}.{resolvedPath}.{identifier}` when `messagePrefix` exists, then `{fallbackPrefix}.{identifier}` when `fallbackPrefix` exists, then allow core to return the original issue message. Key generation SHALL use the resolved path: only an empty resolved path omits the field segment. Known missing identifiers SHALL NOT silently change to `invalid`. The default builder SHALL dot-join unescaped string and number segments and skip the field candidate when another segment type is present. A custom key builder SHALL receive the message context, fallback prefix and ordered default keys; its ordered result SHALL replace the defaults, and an empty result SHALL skip that adapter's dictionary lookup.

#### Scenario: Field-specific translation
- **WHEN** `forms.signup.email.invalidEmail` exists for an `invalidEmail` issue at `email`
- **THEN** an adapter configured with `messagePrefix: 'forms.signup'` returns that translation

#### Scenario: Global translation fallback
- **WHEN** the field-specific key is absent and `errors.invalidEmail` exists
- **THEN** an adapter configured with `fallbackPrefix: 'errors'` returns the global translation

#### Scenario: Raw-message fallback
- **WHEN** no configured resolver resolves an issue
- **THEN** the original Standard Schema issue message is returned

#### Scenario: Pathless prefixed child issue
- **WHEN** a pathless issue belongs to a registration at `['shipping']` with prefix `forms.signup`
- **THEN** its field candidate is `forms.signup.shipping.invalid`

#### Scenario: Empty resolved path
- **WHEN** an issue has an empty resolved path and prefix `forms.signup`
- **THEN** its field candidate is `forms.signup.invalid`

#### Scenario: Absent prefixes
- **WHEN** `messagePrefix` or `fallbackPrefix` is absent
- **THEN** the adapter skips that candidate without generating an `undefined` key

#### Scenario: Custom key builder
- **WHEN** an application's catalogue cannot use dot-joined field paths
- **THEN** its adapter can build different candidate keys without changing core validation paths

#### Scenario: Empty custom key list
- **WHEN** a custom key builder returns an empty list
- **THEN** that adapter performs no dictionary lookup and the resolver chain continues

### Requirement: Missing-message diagnostics are actionable and isolated
Built-in adapters SHALL support silent, warning and callback missing-message policies. With `missing` omitted, they SHALL warn when `process.env.NODE_ENV !== 'production'` and remain silent in production. A diagnostic SHALL occur only after locale fallback, key fallback and the complete resolver chain fail, and only when localisation was configured. Core SHALL invoke at most one missing handler: the highest-precedence attempted adapter with a handler. A silent adapter SHALL install a no-op handler and suppress lower-precedence handlers. The selected adapter SHALL receive the prefix, path, identifier and ordered locale/key attempts and SHALL deduplicate reports per adapter instance, locale and logical key.

#### Scenario: Development warning
- **WHEN** localisation is configured, all resolver candidates fail and warning mode is active
- **THEN** raw-message fallback is returned and one actionable diagnostic is emitted

#### Scenario: Default development policy
- **WHEN** `missing` is omitted outside production and all resolver candidates fail
- **THEN** the adapter emits one warning

#### Scenario: Default production policy
- **WHEN** `missing` is omitted with `process.env.NODE_ENV` equal to `production`
- **THEN** raw-message fallback is returned without a warning

#### Scenario: Successful fallback does not warn
- **WHEN** a field-specific key is absent but a later configured resolver or global key succeeds
- **THEN** no missing-message diagnostic is emitted

#### Scenario: Multiple adapter misses
- **WHEN** several diagnostic-capable adapters fail to resolve the same issue
- **THEN** only the highest-precedence adapter with a missing handler reports once and receives each locale's attempted keys separately

#### Scenario: Local silent policy
- **WHEN** a higher-precedence local adapter is silent and a lower application adapter is configured to warn
- **THEN** the local no-op handler owns final failure and the application adapter does not warn

#### Scenario: No localisation configured
- **WHEN** no message resolver is configured
- **THEN** raw issue messages are returned without localisation diagnostics

#### Scenario: Strict test callback
- **WHEN** missing-message policy is a callback
- **THEN** the callback receives enough structured context for a test or build check to fail deliberately and a thrown callback error is surfaced

### Requirement: The Vue I18n adapter honours its Composer
The Vue I18n adapter SHALL accept a caller-owned Composition API Composer, use its own locale fallback chain, interpolation and pluralisation behaviour, and work with both an application-global Composer and a component-local `useI18n()` Composer. It SHALL use catalogue existence rather than comparing translated text with a key. It SHALL NOT call `useI18n()`, obtain another Composer from ambient component state or mutate the supplied Composer. A local Composer SHALL require `fallbackRoot: false`; incompatible configuration SHALL fail with an actionable error rather than bypassing inherited Verific resolvers. The inherited application adapter SHALL provide global catalogue fallback. Adapter state and diagnostic caches SHALL belong to that adapter instance.

#### Scenario: Application-global Composer
- **WHEN** `vueI18nMessages(i18n.global)` is supplied to `createVerific()`
- **THEN** registrations without overrides resolve through that Composer

#### Scenario: Component-local Composer
- **WHEN** a caller obtains `const composer = useI18n({ useScope: 'local' })`, sets `composer.fallbackRoot = false`, and supplies `vueI18nMessages(composer)` to a registration
- **THEN** its local messages are tried before inherited and application resolvers

#### Scenario: Captured local Composer
- **WHEN** an adapter is created from a caller-owned local Composer after component setup has completed
- **THEN** it resolves through that Composer without requiring a current component instance or consulting another application's global Composer

#### Scenario: Local root fallback preserves resolver precedence
- **WHEN** a caller-configured local Composer has `fallbackRoot: false` and its own locale chain misses a key
- **THEN** the local adapter reports its own attempted locales and the inherited application resolver is tried next

#### Scenario: Incompatible local root fallback
- **WHEN** a local Composer with `fallbackRoot: true` is supplied
- **THEN** adapter creation reports how to set `fallbackRoot: false` so inherited Verific resolver precedence is preserved

#### Scenario: Native pluralisation
- **WHEN** a semantic issue explicitly provides a plural count
- **THEN** the adapter passes it through using Vue I18n's pluralisation behaviour

#### Scenario: Translation equals its key
- **WHEN** a catalogue contains a translation whose value is identical to its key
- **THEN** the adapter treats it as resolved and does not emit a missing-message diagnostic

#### Scenario: Locale fallback catalogue
- **WHEN** a key is absent from the active locale but present through the Composer's configured locale fallback
- **THEN** the fallback translation receives interpolation values and plural count and no missing-message diagnostic is emitted

### Requirement: Non-dictionary resolvers can implement the core boundary
The resolver context SHALL support adapters with configuration models unlike Vue I18n. Core SHALL NOT require dynamic key lookup, a particular namespace model or a specific locale library.

#### Scenario: Namespace-oriented resolver
- **WHEN** a custom resolver uses a namespace-oriented fake catalogue
- **THEN** it resolves through the core context without emulating Vue I18n configuration

#### Scenario: Generated-function-map resolver
- **WHEN** a custom resolver selects from an explicit map of generated message functions
- **THEN** it resolves without runtime property lookup over the module's exports

#### Scenario: Custom reactive locale source
- **WHEN** a custom resolver reads a Vue ref representing its active locale
- **THEN** message selectors re-evaluate when that ref changes without rerunning validation
