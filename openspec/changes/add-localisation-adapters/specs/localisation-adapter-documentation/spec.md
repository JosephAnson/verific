## Purpose

Make every supported localisation integration easy to find, copy and verify while keeping compatibility claims aligned with the packages that users actually install.

## ADDED Requirements

### Requirement: Localisation adapters have dedicated information architecture

The documentation MUST provide a discoverable Localisation adapters section with an overview and dedicated guidance for Vue I18n, i18next, Paraglide and custom catalogue drivers. The primary localisation guide MUST explain the shared issue-to-message model and direct readers to the appropriate adapter page instead of presenting one locale library as the universal path.

#### Scenario: Reader chooses a locale library

- **WHEN** a reader opens the localisation overview or site navigation
- **THEN** they MUST be able to reach dedicated Vue I18n, i18next and Paraglide setup guidance directly

#### Scenario: Reader uses another library

- **WHEN** a reader's locale library has no first-party package
- **THEN** the same section MUST link to a custom-driver guide for implementing the core resolver boundary

#### Scenario: Existing Vue I18n reader

- **WHEN** a reader follows existing localisation guidance
- **THEN** the Vue I18n route MUST remain clear and its public `vueI18nMessages()` usage MUST remain recognisable

### Requirement: Adapter guides are copy-ready and library-specific

Each first-party adapter guide MUST show the exact packages to install, the imports to use, application-level `createVerific({ messages })` configuration, form-level prefix usage, error rendering from destructured validation members, and the library-specific locale-change path. The i18next guide MUST explain reuse of the same instance with i18next-vue, adapter-owned language-change invalidation, and disposal at the owning application or request lifetime. The Paraglide guide MUST show explicit imports, a required caller-owned locale getter and an explicit key-to-generated-function map rather than dynamic module lookup.

#### Scenario: Vue I18n setup

- **WHEN** a reader copies the Vue I18n application example
- **THEN** it MUST use a caller-owned Composer and `vueI18nMessages()` with the documented compatible packages

#### Scenario: i18next-vue setup

- **WHEN** a reader copies the i18next-vue example
- **THEN** the same initialised i18next instance MUST be supplied to both i18next-vue and `i18nextMessages()`

#### Scenario: i18next adapter cleanup

- **WHEN** a reader follows application or SSR teardown guidance
- **THEN** the example MUST dispose the adapter at the lifetime boundary that owns its language, load and resource-store listeners

#### Scenario: Paraglide setup

- **WHEN** a reader copies the Paraglide example
- **THEN** every validation key used by the example MUST be visibly associated with a statically imported generated message function and the adapter MUST receive an explicit locale getter

#### Scenario: Form usage

- **WHEN** an adapter guide renders field errors
- **THEN** the example MUST destructure the validation members it uses and retain the documentation site's accessible complete-form contract

### Requirement: Shared catalogue and diagnostic behaviour is taught once

The documentation MUST define the key-first field-specific, global and raw-message fallback order once, explain semantic identifiers and interpolation values, and describe every missing-message policy including `missing: 'throw'`. It MUST explain that final diagnostics aggregate complete key-and-locale attempts across chained adapters, that later resolver success suppresses diagnostics, and that warning deduplication is finite rather than a completeness guarantee. Adapter pages MUST link to that shared contract and describe only meaningful library-specific differences.

#### Scenario: Reader investigates a missing key

- **WHEN** a translation cannot be resolved
- **THEN** the documentation MUST show the ordered key-and-locale attempts across configured adapters, when warnings occur, and how strict throw mode can fail a test or build check

#### Scenario: Reader chooses production behaviour

- **WHEN** a reader compares missing-message policies
- **THEN** the documentation MUST state the development and production defaults and explain silent, warning, throw and callback modes

#### Scenario: Reader supplies interpolation values

- **WHEN** a semantic validation issue includes values or a plural count
- **THEN** the shared guide MUST explain that adapters pass the structured values to the locale library without putting translated prose in the schema

### Requirement: SSR and reactivity boundaries are explicit

Every first-party adapter guide MUST explain how locale changes update derived errors without schema revalidation and how to create or obtain request-owned locale state for server rendering. The guidance MUST avoid module-level mutable locale singletons in SSR examples.

#### Scenario: Client locale switch

- **WHEN** a reader follows an adapter's locale-switch example after validation
- **THEN** the displayed error MUST change while the demonstrated validation-run count remains unchanged

#### Scenario: Server-rendered application

- **WHEN** a reader follows an SSR example or note
- **THEN** it MUST create or receive the locale-library instance or locale source within the request or application boundary documented for that library

#### Scenario: Nuxt with i18next

- **WHEN** a reader follows the manual Nuxt i18next setup
- **THEN** the plugin MUST use a request-owned i18next instance, install its Verific adapter once, and dispose that adapter with the owning Nuxt application or request scope

#### Scenario: Nuxt with Paraglide

- **WHEN** a reader follows the manual Nuxt Paraglide setup
- **THEN** the plugin MUST supply a request-owned locale getter and MUST NOT depend on mutable process-global locale selection

### Requirement: Compatibility claims match published package metadata

The documentation MUST publish a compatibility table for each adapter and its locale runtime. Documented supported ranges and installation package names MUST match the corresponding adapter package's peer dependencies and public exports. Repository checks MUST fail when documentation compatibility data, package peer ranges or shown public factory names diverge.

#### Scenario: Peer range changes

- **WHEN** an adapter's supported locale-library peer range is changed without updating its documentation compatibility entry
- **THEN** the documentation quality gate MUST fail

#### Scenario: Public factory changes

- **WHEN** a guide imports a factory that the packed adapter does not export
- **THEN** the documentation or packed-consumer gate MUST fail before release

#### Scenario: Adapter is independently installed

- **WHEN** a reader consults a compatibility entry
- **THEN** it MUST identify the adapter package, its directly required locale runtime and the supported range without implying that unrelated adapters are required

#### Scenario: Current i18next major

- **WHEN** a reader consults the i18next compatibility entry or installs its documented dependencies
- **THEN** the supported range MUST be `i18next >=26 <27`, the compatible Vue peer MUST be listed, and the compiled example baseline MUST use i18next 26

### Requirement: Copyable adapter examples are verified

Documentation checks MUST compile and type-check the copyable adapter examples against packed Verific packages and supported real locale-library baselines. They MUST compile representative Vue I18n and i18next integrations with their actual runtimes and a Paraglide integration with actual generated message output. The checks MUST also verify internal adapter navigation and reject inaccessible complete-form examples.

#### Scenario: Adapter API drifts

- **WHEN** a package export or option changes without updating a copyable example
- **THEN** the documentation check MUST fail

#### Scenario: Paraglide generated signature drifts

- **WHEN** the documented explicit map no longer accepts the real generated functions without wrappers or casts
- **THEN** the compiled documentation example MUST fail

#### Scenario: Packed module format drifts

- **WHEN** a documented adapter is missing a declared ESM, CommonJS or declaration entry point from its packed tarball
- **THEN** the consumer documentation gate MUST fail before release

#### Scenario: Adapter navigation breaks

- **WHEN** an adapter page is removed or renamed while navigation still references it
- **THEN** the documentation check MUST fail

### Requirement: Unneeded migration guidance is removed

The documentation MUST NOT present a migration guide for an unreleased consumer surface. The migration route MUST be removed from authored navigation and internal links rather than retained as a primary documentation destination.

#### Scenario: Reader scans documentation navigation

- **WHEN** the documentation is built after this change
- **THEN** no Migration entry or internal link to `/guide/migration` MUST remain

#### Scenario: Stale migration route is reintroduced

- **WHEN** authored documentation or navigation references the removed migration route
- **THEN** the documentation quality gate MUST fail
