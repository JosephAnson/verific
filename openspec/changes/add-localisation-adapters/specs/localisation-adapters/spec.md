## Purpose

Provide consistent, first-party localisation adapters for the major Vue-compatible catalogue models without coupling core validation or schemas to a locale library.

## ADDED Requirements

### Requirement: Catalogue adapters share one resolution contract

The first-party catalogue adapters MUST apply the same ordered candidate-key and fallback semantics. For an issue with a semantic identifier, they MUST try the field-specific `{messagePrefix}.{resolvedPath}.{identifier}` candidate when available, then the global `{fallbackPrefix}.{identifier}` candidate when available, and finally allow core to return the original issue message. Resolution MUST be key-first: every locale for the higher-priority key is tried before the next key. Adapters MUST preserve identifier casing, interpolation values, plural count, candidate and locale order, and empty-string translations. A caller-supplied key builder MUST replace the default candidate list consistently for every catalogue adapter.

#### Scenario: Field-specific message wins

- **WHEN** both `forms.signup.email.invalidEmail` and `errors.invalidEmail` can be resolved
- **THEN** an adapter configured with `messagePrefix: 'forms.signup'` and `fallbackPrefix: 'errors'` MUST return the field-specific message

#### Scenario: Global message is the catalogue fallback

- **WHEN** the field-specific candidate is absent and `errors.invalidEmail` can be resolved
- **THEN** the adapter MUST return the global message without reporting a missing translation

#### Scenario: Catalogue cannot resolve an issue

- **WHEN** no ordered candidate can be resolved by any configured message resolver
- **THEN** core MUST retain the original Standard Schema issue message as the display fallback

#### Scenario: Shared interpolation semantics

- **WHEN** equivalent catalogue entries are resolved through different first-party adapters
- **THEN** each adapter MUST receive the same named interpolation values and explicit plural count from the semantic issue description

#### Scenario: Form message exists in a fallback locale

- **WHEN** a field-specific key exists only in a fallback locale and a global key exists in the active locale
- **THEN** the field-specific fallback-locale message MUST win

#### Scenario: Custom candidate keys

- **WHEN** a key builder returns an application-specific ordered key list
- **THEN** every first-party catalogue adapter MUST attempt exactly that list in order instead of the default candidates

### Requirement: Shared catalogue behaviour is reusable

`@verific/i18n` MUST expose a typed, locale-library-neutral catalogue driver boundary that owns candidate construction and missing-message policy while allowing an integration to supply catalogue existence, translation and locale-attempt behaviour. Vue I18n, i18next and Paraglide MUST use that shared boundary rather than maintaining divergent copies. Applications MUST be able to use the same boundary for an unbundled locale library without adding that library to core.

#### Scenario: Custom catalogue driver

- **WHEN** an application supplies existence, translation and locale-attempt behaviour for another locale library
- **THEN** the resulting core message resolver MUST receive the same key ordering, interpolation data and missing policies as a first-party adapter

#### Scenario: Shared behaviour changes

- **WHEN** the common candidate or diagnostic contract changes
- **THEN** contract tests for Vue I18n, i18next, Paraglide and a fake custom driver MUST exercise the same expected behaviour

### Requirement: Core carries complete unresolved attempts

Core's unresolved diagnostic resolution MUST support an additive `attempts` array while retaining the existing singular `attempt` carrier for third-party compatibility. A shared catalogue adapter MUST return its complete ordered key-and-locale attempts directly through `attempts`; it MUST NOT rely on its missing handler to reconstruct private attempts later. Core MUST append each resolver's contributed attempts in resolver order and deliver the complete aggregate to the first attempted adapter that owns a missing handler after every resolver fails.

#### Scenario: Complete shared-adapter miss

- **WHEN** a shared adapter tries two candidate keys across two locales without resolving either
- **THEN** its unresolved result MUST carry all four key-and-locale attempts in key-first order

#### Scenario: Two adapters miss

- **WHEN** two diagnostic adapters each return multiple unresolved attempts and both own missing handlers
- **THEN** core MUST call only the first owner's handler with the complete ordered attempts from both adapters

#### Scenario: Legacy diagnostic adapter

- **WHEN** an existing third-party adapter returns one singular `attempt`
- **THEN** core MUST retain that attempt in the final diagnostic without requiring the adapter to adopt `attempts`

#### Scenario: Resolution after accumulated misses

- **WHEN** earlier adapters contribute unresolved attempts and a later resolver succeeds
- **THEN** core MUST return the resolved message without invoking a missing handler

### Requirement: Missing-message policies support development and enforcement

Every first-party adapter MUST support `missing: 'silent'`, `missing: 'warn'`, `missing: 'throw'` and a structured callback. When omitted, the policy MUST warn outside production and remain silent in production. Missing handling MUST occur only after locale fallback, candidate-key fallback and the complete core resolver chain fail. The diagnostic context MUST identify the semantic identifier, resolved path and prefix, and MUST preserve the complete ordered key-and-locale attempts contributed by each catalogue adapter in the resolver chain without exposing captured model values. Warning reports MUST be deduplicated by key and locale within a finite per-adapter cache. The cache bound is an implementation concern: equivalent misses MUST be suppressed while resident, and MAY be reported again only after their entries have been evicted.

#### Scenario: Development warning

- **WHEN** all configured resolvers fail and warning mode is active
- **THEN** the original issue message MUST be returned and one actionable warning MUST describe the attempted catalogue lookup

#### Scenario: Strict test mode

- **WHEN** all configured resolvers fail under `missing: 'throw'`
- **THEN** message resolution MUST throw an actionable missing-message error containing the structured lookup context

#### Scenario: A later resolver succeeds

- **WHEN** one adapter misses but a lower-precedence resolver resolves the issue
- **THEN** no missing warning, callback or throw MUST occur and accumulated failed attempts MUST be discarded

#### Scenario: Chained catalogue adapters all miss

- **WHEN** two catalogue adapters with different locale chains and candidate keys both fail
- **THEN** the selected missing handler MUST receive one complete flattened list of every key-and-locale attempt from both adapters in stable resolver order, preserving duplicate attempts without adding adapter provenance

#### Scenario: Repeated key-and-locale miss

- **WHEN** the same adapter reports an equivalent key-and-locale miss while its deduplication entry remains resident
- **THEN** warning or callback mode MUST report it only once

#### Scenario: Bounded diagnostic state

- **WHEN** enough distinct misses are resolved to exceed an adapter's finite deduplication capacity
- **THEN** the cache MUST remain bounded and a previously evicted key-and-locale miss MAY be reported again

#### Scenario: Production default

- **WHEN** `missing` is omitted in production and no configured resolver succeeds
- **THEN** the original issue message MUST be returned without a diagnostic

#### Scenario: Application callback

- **WHEN** a missing callback is selected after final resolution failure
- **THEN** it MUST receive the same structured context as built-in warning and throw modes, and any error it throws MUST be surfaced

### Requirement: Vue I18n retains its existing public integration

`@verific/vue-i18n` MUST continue to expose `vueI18nMessages(composer)` and MUST preserve its existing caller-owned Composer behaviour while using the shared catalogue contract. It MUST use the supplied Composer's existence checks, locale fallback, interpolation and pluralisation, MUST react to that Composer's locale changes without revalidating, and MUST NOT obtain or mutate a Composer through ambient component state.

#### Scenario: Existing application configuration

- **WHEN** an application supplies `vueI18nMessages(i18n.global)` to `createVerific()`
- **THEN** validation messages MUST resolve through that Composer with no public factory change

#### Scenario: Existing local Composer configuration

- **WHEN** a registration supplies an explicitly configured component-local Composer
- **THEN** local catalogue messages MUST be tried before inherited resolvers and locale changes MUST update committed validation messages without rerunning the schema

#### Scenario: Shared behaviour parity

- **WHEN** Vue I18n misses the same ordered candidate keys as another first-party adapter
- **THEN** it MUST produce equivalent missing context and apply the same selected missing policy

### Requirement: i18next uses a caller-owned instance

`@verific/i18next` MUST expose `i18nextMessages(i18n)` for a caller-owned i18next instance. The adapter MUST use that instance's catalogue existence, language fallback, interpolation, pluralisation and resolved-language behaviour. It MUST work when that instance is also installed through i18next-vue, and MUST NOT read from or mutate the i18next module's default singleton. It MUST support i18next `>=26 <27`.

#### Scenario: Plain i18next application

- **WHEN** an initialised i18next instance is supplied to `i18nextMessages()`
- **THEN** messages MUST resolve through that instance's active language, fallback languages and resource store

#### Scenario: i18next-vue application

- **WHEN** the same caller-owned instance is installed into i18next-vue and supplied to Verific
- **THEN** component translations and validation messages MUST use the same language state without requiring an i18next-vue-specific adapter

#### Scenario: Language changes after validation

- **WHEN** the supplied instance emits a language change after invalid issues have been committed
- **THEN** adapter-owned reactive invalidation MUST cause derived validation messages to update to the new language without another schema invocation

#### Scenario: Exact plural candidate exists

- **WHEN** an issue supplies a plural count and i18next selects a count-specific resource form
- **THEN** the adapter MUST use that same count and semantic lookup context for both exact-locale existence checking and translation

#### Scenario: Zero plural count

- **WHEN** an issue supplies a plural count of zero
- **THEN** the adapter MUST pass zero to both existence checking and translation rather than treating it as absent

#### Scenario: No plural count

- **WHEN** an issue has no semantic plural count
- **THEN** the adapter MUST omit `count` from both existence and translation operations rather than supplying an undefined or invented value

#### Scenario: Exact locale selection

- **WHEN** i18next checks and translates one key in one locale
- **THEN** both operations MUST receive `lngs: [locale]` and the same lookup-relevant semantic context so the shared key-first locale order remains authoritative

#### Scenario: Configured namespace resolution

- **WHEN** the caller's i18next instance resolves a key through its configured namespace behaviour
- **THEN** the adapter MUST permit i18next to own that namespace resolution consistently for both existence checking and translation

#### Scenario: Translation text equals its key

- **WHEN** an i18next resource exists and its translated value equals the lookup key
- **THEN** the adapter MUST treat it as resolved rather than reporting it missing

### Requirement: i18next reactive resources have an explicit lifetime

The adapter returned by `i18nextMessages()` MUST expose an idempotent `dispose()` operation for the reactive listeners it owns. Creating an adapter MUST attach exactly one listener for each i18next `languageChanged` and `loaded` event and each resource-store `added` and `removed` event. Every one of those events MUST invalidate derived messages through adapter-owned Vue reactivity. `dispose()` MUST detach all four of that adapter's listeners without altering the caller-owned i18next instance, resource store or other adapters. Diagnostic deduplication state belongs to the adapter object's lifetime and MUST NOT be specified as reset by listener disposal. Application and Nuxt integrations MUST be able to align disposal with their application or request lifetime.

#### Scenario: Adapter disposal

- **WHEN** a caller disposes an i18next adapter
- **THEN** its `languageChanged`, `loaded`, resource `added` and resource `removed` listeners MUST all be removed and later events MUST NOT trigger that adapter's reactive invalidation

#### Scenario: Resources change without a language change

- **WHEN** i18next loads resources or its resource store adds or removes a bundle after validation
- **THEN** derived validation messages MUST update without another schema invocation

#### Scenario: Repeated disposal

- **WHEN** the same adapter is disposed more than once
- **THEN** every call MUST complete safely without duplicate unsubscription or an error

#### Scenario: Two adapters share one instance

- **WHEN** two adapters listen to the same i18next instance and one is disposed
- **THEN** the other adapter MUST continue receiving language-change invalidation

#### Scenario: Request lifetime ends

- **WHEN** an SSR request or application plugin scope that owns an adapter is destroyed
- **THEN** it MUST be possible to dispose the adapter without retaining any of its four i18next listeners beyond that lifetime

### Requirement: Paraglide uses an explicit generated-message map

`@verific/paraglide` MUST expose `paraglideMessages()` as a factory that receives an explicit map from Verific candidate keys to imported Paraglide message functions and a required caller-owned locale getter. It MUST select only from that map and MUST NOT discover messages by reflecting over, dynamically indexing, or importing every generated module export. The adapter MUST read the getter during every resolution and pass semantic interpolation values and that locale to the selected function.

#### Scenario: Explicit message selection

- **WHEN** the map associates `errors.required` with an imported generated message function
- **THEN** a required issue whose ordered candidates reach that key MUST invoke that exact function

#### Scenario: Concrete generated functions type-check directly

- **WHEN** a map contains real generated functions with no inputs and with required typed interpolation inputs
- **THEN** both function shapes MUST be assignable directly without wrappers, casts or widening the generated types

#### Scenario: Unmapped field key falls back

- **WHEN** a field-specific candidate is absent from the map but its global fallback candidate is mapped
- **THEN** the global generated message function MUST be invoked without a missing diagnostic

#### Scenario: No generated-message reflection

- **WHEN** the generated message module contains exports not present in the explicit map
- **THEN** those exports MUST remain unavailable to the adapter and MUST NOT be discovered at runtime

#### Scenario: Reactive locale source

- **WHEN** the caller-owned locale source changes after validation
- **THEN** derived validation messages MUST invoke the mapped function for the current locale without rerunning the schema

#### Scenario: Locale getter is absent

- **WHEN** TypeScript checks a `paraglideMessages()` call without a locale getter
- **THEN** the call MUST fail type checking rather than silently using process-global locale state

### Requirement: Adapter state is isolated for SSR

First-party adapters MUST keep locale-library references, reactive locale state and missing-message caches within the adapter instance. They MUST NOT store an active locale-library instance, locale or diagnostic cache in mutable module-level state.

#### Scenario: Concurrent i18next rendering

- **WHEN** two server requests resolve through distinct i18next instances with different active languages
- **THEN** each request MUST receive messages and diagnostics from only its own instance

#### Scenario: Concurrent Paraglide rendering

- **WHEN** two server requests create adapters with distinct caller-owned locale sources
- **THEN** each mapped message function MUST receive the locale for its own request

#### Scenario: Diagnostic isolation

- **WHEN** equivalent missing keys occur in two separately created adapter instances
- **THEN** one instance's warning-deduplication state MUST NOT suppress the other's diagnostic

### Requirement: Locale dependencies remain outside core

Core MUST NOT import or declare optional dependencies on Vue I18n, i18next, i18next-vue or Paraglide. Each published leaf adapter package MUST declare the compatible locale runtime it directly integrates with as a peer dependency and MUST remain independently installable. Because `@verific/i18next` imports Vue's `shallowRef` directly for adapter-owned invalidation, it MUST also declare the repository's compatible Vue range as a peer dependency rather than relying on a transitive installation.

#### Scenario: Core-only consumer

- **WHEN** a consumer installs `@verific/core` without a locale library
- **THEN** installation, build and validation MUST succeed without resolving any first-party adapter dependency

#### Scenario: Packed adapter consumer

- **WHEN** a clean consumer installs one packed adapter with the documented compatible locale runtime
- **THEN** its public factory, types and runtime entry point MUST resolve without installing the other locale libraries

#### Scenario: i18next reactive peer

- **WHEN** a clean consumer installs `@verific/i18next`
- **THEN** its peer requirements MUST explicitly identify both i18next `>=26 <27` and the compatible Vue runtime used for shallow reactive invalidation

### Requirement: Published adapters work through every declared entry point

Each packed adapter MUST expose equivalent ESM, CommonJS and TypeScript declaration entry points. Package verification MUST install the produced tarballs into clean consumers and exercise real locale runtimes or generated output rather than workspace source aliases or hand-written stand-ins.

#### Scenario: ESM consumer

- **WHEN** a clean ESM consumer imports a factory from a packed adapter
- **THEN** it MUST resolve and localise a representative validation issue

#### Scenario: CommonJS consumer

- **WHEN** a clean CommonJS consumer requires the same packed adapter
- **THEN** its equivalent public factory MUST resolve and localise the same representative issue

#### Scenario: TypeScript consumer

- **WHEN** a strict TypeScript consumer checks Vue I18n, i18next and Paraglide setup against packed declarations
- **THEN** the documented factories, options, disposal operation and real generated Paraglide functions MUST type-check
