## Why

Verific currently requires users to create a validation scope separately from each schema registration, and it only exposes validator-authored message strings. This makes the common form setup unnecessarily ceremonial and forces applications to place localisation concerns in schemas or repeat issue-code checks in Vue templates.

## What Changes

- **BREAKING** Replace the public `createValidationScope()` and `useValidate()` workflow with one `useValidation()` composable. The first registration creates a scope and descendant registrations join it automatically; nested independent forms can explicitly create a new scope.
- **BREAKING** Narrow `@verific/nuxt` compatibility to Nuxt `>=3.21 <5`, the range exercised by the automatic locale integration and consumer matrix.
- Make scope-wide validation, registration-specific results and resolved issue paths explicit without taking ownership of the application's model state.
- Preserve Standard Schema transformed output for each registration while retaining the existing latest-run, disposal and snapshot guarantees.
- Add a vendor-neutral message resolver contract to `createVerific()` with per-registration overrides.
- Add semantic issue descriptors so locale adapters can use stable identifiers and interpolation values without parsing human-readable messages.
- Expose ready-to-render localised message selectors such as `errorsFor()` and `errorFor()`; messages remain derived so locale changes do not rerun validation.
- Add a Vue I18n adapter with field-specific and global fallback keys, development diagnostics for missing keys, and fallback to the original Standard Schema message.
- Extend `@verific/nuxt` with serialisable Vue I18n configuration that binds to the request-local `nuxtApp.$i18n` composer at runtime, while retaining an explicit manual-plugin path for other locale libraries and advanced configuration.
- Update tests, playgrounds and documentation around the new API and migration path.

## Capabilities

### New Capabilities

- `validation-composition`: Model-based Standard Schema registration, implicit scope composition, validation lifecycle and typed registration output.
- `validation-message-resolution`: Semantic issue descriptions, resolver inheritance, localised message selection, fallback and missing-key diagnostics.
- `nuxt-validation-integration`: Nuxt module configuration, request-safe Vue I18n binding, manual adapter installation and Nuxt compatibility guarantees.

### Modified Capabilities

None. This repository has no existing OpenSpec capabilities.

## Impact

- Public exports in `@verific/core`, including a breaking composable rename and removal of explicit scope setup.
- Core validation state, path handling, issue representation and result types.
- A new `@verific/vue-i18n` adapter package with `vue-i18n` as a peer dependency.
- `@verific/nuxt` module options, runtime plugin and generated imports.
- Vue and Nuxt playgrounds, package documentation, migration guidance and CI/runtime fixtures.
- No proprietary validation-rule DSL, form-state ownership, required message-rendering component, ESLint plugin or devtools integration is introduced by this change.
