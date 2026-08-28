## Why

The documentation explains Verific through static code, but readers cannot verify the core interaction model without leaving the page and assembling an application. Inline runnable examples will make validation, descendant scope composition and reactive localisation observable at the point each concept is introduced.

## What Changes

- Add three accessible inline examples to Getting Started, Scopes and registrations, and Localisation.
- Use real `@verific/core` and `@verific/vue-i18n` runtime code rather than simulated validation.
- Display source imported from the same Vue components that power the examples.
- Add interaction tests for validation, registration disposal and locale changes without revalidation.
- Extend the documentation quality gate and Docker build so the examples compile, run and ship from declared workspace dependencies.
- Keep Nuxt-specific module behaviour in the existing real Nuxt playground and link to it from the Nuxt guide.

## Capabilities

### New Capabilities

- `interactive-documentation-examples`: Runnable, accessible documentation examples with source parity and regression coverage.

### Modified Capabilities

None.

## Impact

- Documentation Vue components, Markdown pages, shared documentation styles and checks.
- Documentation package dependencies and lockfile.
- Docker documentation build inputs and build order.
- No change to the published validation APIs.
