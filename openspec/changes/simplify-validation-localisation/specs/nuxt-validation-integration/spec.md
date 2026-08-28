## Purpose

Define how the Nuxt module installs Verific and binds optional localisation adapters safely across Nuxt 3, Nuxt 4 and server rendering.

## ADDED Requirements

### Requirement: Nuxt message configuration is serialisable
`@verific/nuxt` SHALL accept either automatic installation with an optional serialisable message-adapter selection, or `global: false` without message options. The Vue I18n selection SHALL accept only static options such as `fallbackPrefix` and missing-message policy; it SHALL NOT accept a Composer, translation function or resolver function in `nuxt.config.ts`.

#### Scenario: Vue I18n selection
- **WHEN** `verific.messages` selects `vue-i18n` with static options
- **THEN** those options are passed unchanged to the runtime integration without serialising runtime functions or a Composer

#### Scenario: No selected adapter
- **WHEN** `verific.messages` is omitted or disabled
- **THEN** Verific installs without requiring Nuxt I18n or a locale adapter

#### Scenario: Conflicting manual configuration
- **WHEN** configuration supplies both `global: false` and module-level message options
- **THEN** TypeScript rejects the combination and JavaScript configuration receives an actionable module-setup error

### Requirement: Vue I18n binds per Nuxt application
When selected, the Vue I18n adapter SHALL be created inside the Verific runtime plugin from the current Composition API `nuxtApp.$i18n` instance. Request-specific composers, locales, resolvers and diagnostic caches SHALL NOT be stored in module-level state. Automatic integration SHALL require Nuxt I18n configured with `legacy: false`.

#### Scenario: Concurrent server rendering
- **WHEN** two Nuxt application instances render concurrently with different locales
- **THEN** each resolves validation messages and missing-key diagnostics through its own `$i18n` instance without cross-request leakage

#### Scenario: Client locale switch
- **WHEN** the client changes locale after validation
- **THEN** derived validation messages update without rerunning validation

#### Scenario: Legacy Vue I18n instance
- **WHEN** automatic integration receives a legacy-mode Vue I18n instance rather than a Composer
- **THEN** startup reports that `legacy: false` is required or directs the user to manual installation

### Requirement: Nuxt I18n initialisation is reliable
The generated Verific runtime plugin SHALL use numeric ordering and depend on Nuxt I18n's `i18n:plugin`, then retain a runtime guard. It SHALL run after synchronous or parallel asynchronous Nuxt I18n initialisation regardless of module declaration order. If Vue I18n is selected but a compatible `nuxtApp.$i18n` is unavailable, application startup SHALL fail with an actionable error naming the required integration and the manual-installation alternative.

#### Scenario: Either module order
- **WHEN** `@nuxtjs/i18n` and `@verific/nuxt` are configured in either order
- **THEN** Verific receives the initialised global i18n instance before installing its Vue plugin

#### Scenario: Parallel asynchronous Nuxt I18n setup
- **WHEN** Nuxt I18n enables its parallel plugin and loads configuration or locale data asynchronously
- **THEN** Verific waits for `i18n:plugin` to settle before reading `$i18n`

#### Scenario: Missing Nuxt I18n
- **WHEN** Vue I18n is selected but `$i18n` is unavailable
- **THEN** startup reports how to install or register `@nuxtjs/i18n` or use `global: false` with a manual plugin

#### Scenario: Localisation disabled
- **WHEN** no message adapter is selected
- **THEN** absence of `$i18n` is valid

### Requirement: Automatic and manual installation do not conflict
Automatic installation SHALL remain enabled by default. Setting `global: false` SHALL register no Verific runtime plugin and perform no locale-adapter dependency check, while retaining public composable auto-imports. Module-level message options SHALL be invalid in manual mode.

#### Scenario: Default installation
- **WHEN** `global` is omitted
- **THEN** the Nuxt module installs exactly one request-local Verific Vue plugin

#### Scenario: Manual installation
- **WHEN** `global: false` and an application plugin installs `createVerific({ messages })`
- **THEN** that resolver is used without a second automatic Verific instance

#### Scenario: Auto-imports in manual mode
- **WHEN** `global: false`
- **THEN** the supported `useValidation` auto-import remains available

### Requirement: Nuxt supports application and component message policies
The resolver installed by the Nuxt module SHALL be the application default. A form SHALL still be able to set `messagePrefix` or override the resolver with a component-local Composer through `useValidation()`.

#### Scenario: Form prefix
- **WHEN** a Nuxt form calls `useValidation(schema, model, { messagePrefix: 'forms.signup' })`
- **THEN** its issues use that prefix with the request-local application resolver

#### Scenario: Local Composer override
- **WHEN** a form supplies a resolver created from a component-local Composer
- **THEN** it is tried before the Nuxt-installed application resolver

### Requirement: Nuxt and Nuxt I18n compatibility is explicit
The module SHALL support Nuxt `>=3.21 <5`. Automatic Vue I18n integration SHALL support Nuxt I18n `>=10.6 <11` and Vue I18n `>=11.4 <12` in Composition API mode. The release matrix SHALL exercise Nuxt 3.21.11 and Nuxt 4.5.2 baselines with Nuxt I18n 10.6.0 and Vue I18n 11.4.10, and package peer ranges and documentation SHALL match these boundaries.

#### Scenario: Nuxt 3 consumer
- **WHEN** the packed packages are installed in the Nuxt 3.21.11 automatic-integration fixture
- **THEN** automatic localisation, SSR rendering and manual installation checks pass

#### Scenario: Nuxt 4 consumer
- **WHEN** the packed packages are installed in the Nuxt 4.5.2 automatic-integration fixture
- **THEN** the same automatic localisation, SSR rendering and manual installation checks pass

### Requirement: Locale integration dependencies remain optional
`@verific/vue-i18n` SHALL peer on compatible `@verific/core` and Vue I18n versions. `@verific/nuxt` SHALL treat both `@verific/vue-i18n` and `@nuxtjs/i18n` as optional peers and SHALL import adapter runtime code only when Vue I18n is selected.

#### Scenario: Consumer without localisation packages
- **WHEN** a packed Nuxt consumer disables message integration and does not install Vue I18n, Nuxt I18n or the adapter
- **THEN** installation, build and runtime succeed without resolving those packages

#### Scenario: Configured localisation consumer
- **WHEN** a packed consumer selects Vue I18n and installs the documented optional peers
- **THEN** module setup resolves the adapter and runtime Composer successfully

### Requirement: Published Nuxt artefacts include runtime integration
Package verification SHALL exercise the packed Nuxt module and its runtime localisation plugin as a consumer would, rather than importing workspace build output only.

#### Scenario: Packed automatic consumer
- **WHEN** a clean Nuxt fixture installs the packed core, adapter and Nuxt tarballs
- **THEN** it can build and render a form using the automatic Vue I18n integration

#### Scenario: Missing runtime artefact
- **WHEN** an exported or generated runtime file is absent from the Nuxt tarball
- **THEN** the package-content gate fails before publication
