## Context

See `proposal.md` for motivation. Core already exposes `DiagnosticMessageAdapter`,
preserves a schema message as the final fallback, and derives error strings lazily
from stored issues. Its unresolved `MessageResolution` currently carries at most
one `attempt`, although a catalogue adapter can try several key/locale pairs.
`@verific/vue-i18n` currently implements catalogue key generation, locale
traversal, translation and missing-key reporting in one package. Adding more
integrations by copying that implementation would let the adapters diverge on the
behaviour users rely on.

The integration boundary must also account for different locale libraries:

- Vue I18n exposes an explicit Composer, locale chain, existence check and
  translator.
- i18next exposes an instance whose `languages`, `exists()` and `t()` already
  represent its configured resolution rules; i18next-vue uses that same instance.
- Paraglide generates statically named message functions rather than a dynamic
  catalogue lookup API, so callers must provide an explicit map from Verific keys
  to generated functions.

Adapters execute while Vue evaluates derived errors. They must therefore read
current locale state at resolution time, not when the adapter is created. Any
deduplication or missing-key state must be owned by an adapter instance so that
concurrent SSR requests cannot affect one another.

## Goals / Non-Goals

**Goals:**

- Put key construction, key precedence, missing-key policy and diagnostic
  deduplication behind one small, framework-neutral catalogue driver.
- Preserve `vueI18nMessages()` as the Vue I18n public entry point while making all
  first-party adapters observably consistent.
- Give each leaf adapter a narrow, typed interface matching its native library.
- Make locale changes observable through the application's own Vue-reactive locale
  source without rerunning validation.
- Test the published package boundaries as well as each adapter's behaviour.

**Non-Goals:**

- Reimplement locale negotiation, message formatting, plural rules or catalogue
  loading already owned by an i18n library.
- Infer every possible translation key statically. Runtime schema identifiers,
  array indices and custom normalisers make completeness a runtime concern, so no
  ESLint package is introduced.
- Add a universal global i18n registry or make `@verific/core` depend on a locale
  library.
- Automatically discover arbitrary i18next or Paraglide instances in Nuxt.

## Decisions

### 1. A shared catalogue adapter is the deep module

Add `@verific/i18n` with this public contract (names are normative; declarations
may use equivalent generic constraints where needed for inference):

```ts
import type {
  DiagnosticMessageAdapter,
  MessageContext,
  MissingMessageDiagnostic,
} from '@verific/core'

export type MissingMessageMode
  = | 'silent'
    | 'warn'
    | 'throw'
    | ((diagnostic: CatalogueMissingMessageDiagnostic) => void)

export interface CatalogueKeyContext extends MessageContext {
  readonly fallbackPrefix?: string
  readonly defaultKeys: readonly string[]
}

export type CatalogueLookupResult
  = | { readonly resolved: true, readonly message: string }
    | { readonly resolved: false }

export interface CatalogueMissingMessageDiagnostic extends MissingMessageDiagnostic {
  readonly fallbackPrefix?: string
}

export interface CatalogueMessageDriver {
  /** Read the current native locale chain on every resolution. */
  readonly locales: () => readonly string[]
  /** Resolve one exact key and locale atomically, without native fallback. */
  readonly lookup: (
    key: string,
    locale: string,
    context: MessageContext,
  ) => CatalogueLookupResult
}

export interface CatalogueMessagesOptions {
  readonly fallbackPrefix?: string
  readonly missing?: MissingMessageMode
  readonly key?: (context: CatalogueKeyContext) => readonly string[]
}

export function createCatalogueMessages(
  driver: CatalogueMessageDriver,
  options?: CatalogueMessagesOptions,
): DiagnosticMessageAdapter
```

`createCatalogueMessages()` generates the default candidates:

1. `{messagePrefix}.{path}.{identifier}`, when `messagePrefix` exists and all path
   segments are strings or numbers;
2. `{fallbackPrefix}.{identifier}`, when `fallbackPrefix` exists.

An empty path produces `{messagePrefix}.{identifier}`. Unsupported property keys,
including symbols, suppress only the path-derived candidate. A custom `key`
function replaces the defaults and receives `defaultKeys` so it can explicitly
retain or reorder them. Duplicate keys and duplicate locale entries are removed
without changing first occurrence order.

Resolution is **key-first**: for each candidate key in order, try every native
locale in order before moving to the next key. This guarantees that a
form-specific key in a fallback locale wins over a shared key in the active locale.
On a complete miss the adapter returns every unsuccessful attempt to core, which
continues through inherited resolvers before falling back to the Standard Schema
message.

Core's unresolved branch is extended additively:

```ts
export type MessageResolution
  = | { readonly resolved: true, readonly message: string }
    | {
        readonly resolved: false
        /** Retained for existing third-party adapters. */
        readonly attempt?: MissingMessageAttempt
        /** Complete ordered attempts for adapters that can report them. */
        readonly attempts?: readonly MissingMessageAttempt[]
      }
```

When a resolver misses, core appends `attempts` when present, otherwise the legacy
singular `attempt`. It preserves resolver and array order and still selects the
first diagnostic adapter with `onMissing` as the reporting owner. Consequently,
the first eventual `onMissing` call receives one core diagnostic containing every
resolver's attempts; no adapter-specific deferred expansion is needed.

`@verific/i18n` returns every attempted key/locale pair directly as `attempts`, in
lookup order, with one `MissingMessageAttempt { locale, keys: [key] }` per pair.
Callbacks receive `CatalogueMissingMessageDiagnostic`, which adds only the
catalogue-specific `fallbackPrefix`; ordered keys and locales are already explicit
in core's `attempts`. Reports are deduplicated by each exact
`locale\u0000candidate-key` pair found in those attempts, per adapter instance. A private finite
`MAX_REPORTED_MISSES` constant bounds an insertion-ordered cache; adding a new
pair at capacity evicts the oldest pair. The limit is deliberately not a public
option or compatibility promise. The package applies `missing`:

- omitted: `'warn'` outside production and `'silent'` in production;
- `'silent'`: do nothing;
- `'warn'`: emit one actionable `console.warn` when a diagnostic contains at least
  one locale/candidate-key pair not currently in the dedupe cache;
- `'throw'`: throw an `Error` containing the same diagnostic summary, intended for
  exercised test and build-render paths;
- callback: receive the complete `CatalogueMissingMessageDiagnostic`.

The driver is deliberately lower-level than a generic `t()` callback. Its atomic
`lookup()` must both determine exact existence and produce the translation for one
selected locale, returning a discriminated union. This avoids a resource update
between separate `has()` and `translate()` calls, distinguishes a real translation
whose text equals its key from a miss, and enforces key-first fallback consistently.

**Alternatives considered:** Keep the logic in every leaf package. This avoids one
package but duplicates the most subtle behaviour and makes fixes inconsistent.
Put the implementation in core. This would widen core around a catalogue-specific
concept despite core already supporting non-catalogue resolvers. Let native
libraries perform all fallback. That produces locale-first behaviour in some
libraries and key-first behaviour in others.

### 2. Leaf adapters expose native inputs and shared options

Each leaf delegates to `createCatalogueMessages()` and re-exports its option type
as the shared catalogue options, adding only library-specific settings when the
native API requires them.

#### Vue I18n

`@verific/vue-i18n` retains:

```ts
export type VueI18nMessagesOptions = CatalogueMessagesOptions

export function vueI18nMessages<Locale extends string>(
  composer: VueI18nComposer<Locale>,
  options?: VueI18nMessagesOptions,
): DiagnosticMessageAdapter
```

The structural `VueI18nComposer` remains limited to the Composition Composer
members used by the adapter. Its driver derives the explicit locale chain from
the current `locale` and `fallbackLocale`. One `lookup()` uses `te(key, locale)`
and, only when present, Vue I18n's selected-locale translation overload:
`t(key, values, { locale, plural: context.count })` (omitting `plural` when no
count exists). It returns all misses through `attempts`; it does not retain a
per-issue `WeakMap`. It never calls the active-locale shorthand after selecting a
fallback locale. A component-local Composer must still set `fallbackRoot = false`;
otherwise Vue I18n could bypass Verific resolver precedence by consulting its
global Composer internally.

#### i18next and i18next-vue

`@verific/i18next` exposes:

```ts
export type I18nextMessagesOptions = CatalogueMessagesOptions

export interface I18nextMessageAdapter extends DiagnosticMessageAdapter {
  /** Remove every i18next and resource-store listener. Safe to call repeatedly. */
  readonly dispose: () => void
}

export function i18nextMessages(
  i18n: i18next.i18n,
  options?: I18nextMessagesOptions,
): I18nextMessageAdapter
```

The locale chain is read from `i18n.languages` for every resolution, falling back
to `resolvedLanguage` and then `language` only when that array is empty. For one
atomic lookup the driver creates one options object containing the interpolation
values, `lngs: [locale]`, and `count` only when defined, then passes that identical
object to `exists(key, options)` and immediately to `t(key, options)` on success.
The supported `lngs` option constrains language resolution to the selected locale.
The adapter deliberately does not override `fallbackNS`: configured namespace
fallback remains native i18next behaviour within that locale, while Verific still
controls key-first ordering across catalogue candidates.

i18next properties and events are not inherently Vue-reactive. The adapter owns a
private Vue `shallowRef` revision, reads it from `locales()`, and increments it for
exactly four event classes: `languageChanged` and `loaded` on the instance, plus
`added` and `removed` on its resource store. `dispose()` removes those exact four
handlers and is idempotent. It promises listener cleanup only; it does not clear
the shared diagnostic cache, whose lifetime is the adapter object and garbage
collection. The same
factory accepts the instance installed through i18next-vue; no wrapper API is
needed. A client application keeps one adapter for its application plugin lifetime
and disposes it when that Vue app unmounts. SSR creates the i18next instance and
adapter inside each request's Nuxt plugin execution and disposes them after that
request renders; neither may be a module-level singleton.

#### Paraglide

`@verific/paraglide` exposes an explicit generated-function map:

```ts
export interface ParaglideMessagesOptions<Locale extends string>
  extends CatalogueMessagesOptions {
  /** Read the current request-owned, Vue-reactive locale. */
  readonly locale: () => Locale
}

export type ParaglideFunctionMap<Messages extends Readonly<Record<string, unknown>>>
  = { readonly [Key in keyof Messages]:
      Messages[Key] extends (...arguments_: infer Arguments) => string
        ? (...arguments_: Arguments) => string
        : never }

export function paraglideMessages<
  Locale extends string,
  const Messages extends Readonly<Record<string, unknown>>,
>(
  messages: Messages & ParaglideFunctionMap<Messages>,
  options: ParaglideMessagesOptions<Locale>,
): DiagnosticMessageAdapter
```

Callers map catalogue keys to generated exports, for example
`{ 'errors.required': m.errors_required }`. Map membership is the existence check;
the selected function receives semantic interpolation values and the current
locale. `count` is added to inputs only when it is defined. The mapped generic
preserves each concrete generated function signature instead of requiring every
function to accept one broad artificial signature. After selecting a key, the
implementation extracts that function's input/options types and performs one
small internal runtime narrowing at the call boundary.

`locale` is required: reading a `ref` or computed locale inside the getter makes
derived Verific errors reactive and makes request-local locale selection explicit
during SSR. There is no implicit process-global Paraglide locale path.

**Alternatives considered:** Accept only a generic translator for all libraries.
That loses native typing, plural behaviour and reliable existence checks. Derive
Paraglide export names from dotted keys. Generated identifiers are configuration-
dependent and cannot represent arbitrary runtime paths safely; an explicit map is
both tree-shakeable and auditable. Depend directly on i18next-vue. Its value is
installation/reactivity around the same i18next instance, so another runtime
dependency would add no adapter capability.

### 3. Reactivity and SSR remain application-owned

Factories capture an explicitly supplied Composer, i18next instance or Paraglide
message map; none reads a process-global singleton. Drivers call their locale
accessors during every `resolve()`. Because core error lists are computed lazily,
reading a Vue ref-backed Composer locale, the i18next adapter's event-backed
revision, or the required Paraglide `locale` getter establishes the dependency
needed to update displayed errors without rerunning the schema.

The shared finite diagnostic cache lives inside each factory result; there is no
issue-attempt `WeakMap`. A Nuxt SSR application must create its Verific plugin and
adapter from request-safe instances; the packages do not cache adapters at module
scope.

**Alternatives considered:** Subscribe to each library and mutate core error
state. That couples adapters to lifecycle APIs and reruns work already handled by
Vue computed dependencies. Store a singleton adapter for convenience. That risks
locale and diagnostic leakage across SSR requests.

### 4. Nuxt automates only integrations with a stable module contract

The existing serialisable module configuration remains the automatic path:

```ts
export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n', '@verific/nuxt'],
  verific: {
    messages: {
      adapter: 'vue-i18n',
      fallbackPrefix: 'errors',
      missing: 'warn',
    },
  },
})
```

It can safely depend on the known `@nuxtjs/i18n` plugin and global Composer.
`missing: 'throw'` and callbacks are deliberately excluded from serialised Nuxt
module options; use a runtime plugin for those modes.

i18next and Paraglide have no single Nuxt installation contract from which
`@verific/nuxt` can reliably discover the correct request-local instance or
generated message map. Their documented path is therefore a Nuxt plugin that
installs `createVerific({ messages: ... })`, with `verific.global: false` to avoid
double installation. The plugin constructs or imports a request-owned i18next
instance, or imports generated Paraglide functions while reading a request-owned
locale ref. It creates the adapter inside `defineNuxtPlugin()`, never at module
scope. i18next examples register `adapter.dispose()` with the server render
completion and client application-unmount hooks. This is explicit, typed and
prevents one request's locale, resource events or warning state leaking to another.

**Alternative considered:** Add `adapter: 'i18next' | 'paraglide'` to serialisable
module options. It would still need undocumented module ordering, import paths or
global discovery, and Paraglide's map cannot be represented as serialisable Nuxt
configuration. Automatic setup can be added later only if an integration offers a
stable request-local injection contract.

### 5. Packages keep dependencies isolated and releases aligned

The additive core resolution type and aggregation tests ship in `@verific/core`;
the legacy singular `attempt` remains accepted. `@verific/i18n` has a peer
dependency on `@verific/core` and imports its types/contracts. Each leaf has
runtime dependency `@verific/i18n` at the workspace release range and peer
dependency `@verific/core`. Locale and reactivity peers are:

- `@verific/vue-i18n`: `vue-i18n >=11.4 <12`;
- `@verific/i18next`: `i18next >=26 <27` and `vue ^3.4.26`, because the package
  directly imports `shallowRef`; i18next-vue is optional application
  integration and is not a package peer;
- `@verific/paraglide`: `@inlang/paraglide-js >=2 <3`.

The repository pins current compatible versions as dev dependencies for tests.
All Verific packages keep the repository's aligned version and are added to the
root release command. Locale runtimes and core remain external in the CJS/ESM
builds. Every package publishes `dist` only, with ESM, CJS and declarations through
the same export shape as existing packages and with `sideEffects: false`.

The root `build`, typecheck, test and publish filters already include new
`packages/*` workspaces; the root `release` command must explicitly add all three
new manifests. The lockfile records i18next 26 and Paraglide 2 test fixtures.
`Dockerfile` must copy each new package manifest before its frozen install layer
and copy each package source before the docs build, preserving cache correctness.
Coverage and lint configuration must include all new `src` and test paths.

Behaviour tests live with each package. Core tests prove legacy `attempt` and new
ordered `attempts` aggregation, including several resolvers and first-owner
reporting. Shared tests cover atomic lookup, key generation, key-first ordering,
unsupported paths, all missing modes, bounded FIFO locale/key-pair diagnostic
deduplication and core fallback composition without issue-indexed retained state. Leaf tests use the real
supported locale runtime and cover interpolation, plural/count handling, exact-
locale fallback, resource changes, runtime locale changes and missing keys. Vue
component tests prove reactive error updates. i18next tests assert the exact lookup
options object (including `lngs`, interpolation values and conditional `count`) is
shared by `exists` and `t`, configured namespace fallback remains available, every
one of the four event classes invalidates, `dispose()` removes all four listener
classes without claiming to clear diagnostics, repeated disposal is safe, and two
SSR instances cannot affect each other. Paraglide runs a compile test
against actual output generated by its pinned compiler, including messages with
different required input signatures, rather than only handwritten lookalikes.

Every package builds and packs independently. Pack tests install the produced
tarballs into clean ESM and CJS consumers, resolve the declared types/import/
require exports, assert locale peers are not bundled, and exercise one successful
and one missing lookup. The packed packages are then consumed by the existing Nuxt
3 and Nuxt 4 integration matrix. The docs checker verifies every adapter page is
reachable from navigation, every internal link and disclosed example resolves,
and no migration route remains. The production Docker docs build is part of the
final integrated gate.

**Alternatives considered:** Make every locale library an optional dependency of
one adapter package. This increases install surface and allows accidental imports
of absent libraries. Bundle shared code into every leaf. That avoids a small
dependency but duplicates code in consumers and hides the reusable custom-driver
seam.

### 6. Documentation is organised by adapter, not migration history

The Localisation navigation gains an overview plus dedicated Vue I18n, i18next and
Paraglide pages. Each page contains installation, application setup, Nuxt setup,
catalogue examples, locale switching and missing-key testing. A shared advanced
page documents `createCatalogueMessages()` for other catalogue libraries and
explains the exact lookup order. The unused migration page and its navigation
entry are removed; the library has no released consumer contract that needs a
migration narrative.

Missing-key guidance recommends `'warn'` during development and `'throw'` in tests
that exercise representative forms. It states the limitation honestly: runtime
diagnostics can prove keys used by exercised paths, not every theoretically
possible model path. No lint rule or build scanner is presented as complete.

## Risks / Trade-offs

- [A native library changes locale-chain semantics within its supported major]
  → Pin real versions in tests, use only documented public APIs, and keep locale
  traversal inside the leaf adapter.
- [Key-first lookup surprises users accustomed to locale-first fallback] → Document
  the two-dimensional lookup order with a concrete form-specific/fallback-locale
  example and test it identically across adapters.
- [A Paraglide map becomes repetitive for many form-specific keys] → Encourage a
  shared `errors.*` map first and allow applications to generate the explicit map
  from their own naming convention; do not hide it behind unsafe runtime guessing.
- [An application forgets to dispose an i18next adapter] → The adapter's lifecycle
  is explicit, `dispose()` is idempotent, and application/Nuxt examples pair
  creation with client-unmount or server-render completion.
- [`missing: 'throw'` surfaces only exercised misses] → Position it as an
  integration-test/build-render guard, not a static completeness proof.
- [Per-instance diagnostic caches grow in a long-lived client session] → Dedupe
  each exact locale/candidate-key attempt in a private finite FIFO cache. The cache
  is released when the adapter object becomes unreachable; `dispose()` is only an
  i18next listener-lifecycle operation.
- [Manual Nuxt plugins are more setup than a module flag] → Provide complete,
  copy-ready examples and reserve automatic integration for contracts that can be
  request-safe without application-specific discovery.

## Migration Plan

1. Extend core's unresolved result additively with ordered `attempts`, preserve
   singular `attempt` compatibility, and test aggregation.
2. Add and test `@verific/i18n` without changing core's message fallback policy.
3. Refactor `@verific/vue-i18n` to the shared driver and run its existing tests as
   compatibility tests before adding the `'throw'` mode.
4. Add the i18next and Paraglide leaf packages, workspace configuration and packed
   consumer coverage.
5. Update Nuxt validation/tests for the shared option surface while retaining the
   existing automatic Vue I18n configuration.
6. Publish the aligned package set together, then publish the adapter-oriented
   documentation and remove the unreleased migration page.

Rollback is package-level: restore the previous `@verific/vue-i18n` implementation
and docs, and stop publishing the new package entry points. Core validation data
and its resolver interface are unchanged, so no stored data or consumer schema
migration is required.
