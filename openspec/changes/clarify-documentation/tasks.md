## 1. Scoped error rendering

- [x] T01 Replace `ErrorMessages` element selection with a required `{ message, index }` scoped slot and cover normalisation, empty-slot and reactive-update behaviour.
  - Depends on: none
  - Writes: packages/core/src/components/ErrorMessages.ts, packages/core/tests/ErrorMessages.test.ts
  - Locks: none
  - Acceptance: Callers own every rendered element; the component adds no wrapper or chosen message element; supported inputs remain normalised in order.
  - Verify: pnpm --filter @verific/core test && pnpm --filter @verific/core typecheck

## 2. Documentation foundations

- [x] T02 Rebuild the site navigation, overview, Vue quickstart and core-concept guides around the canonical scope/registration/issue/error model, removing `BaseField` and using destructured controller methods in simple examples.
  - Depends on: T01
  - Writes: CONTEXT.md, playgrounds/docs/.vitepress/config.mts, playgrounds/docs/index.md, playgrounds/docs/guide/index.md, playgrounds/docs/guide/why.md, playgrounds/docs/guide/core/nested-validation.md, playgrounds/docs/guide/core/service-layer-to-validation.md, playgrounds/docs/guide/core/issues-and-errors.md, playgrounds/docs/guide/components/error-messages.md, playgrounds/docs/guide/migration.md
  - Locks: docs-navigation
  - Acceptance: A first-time Vue user can understand what Verific owns, complete a working form, distinguish scopes/registrations/issues/errors, render accessible error arrays, use the scoped `ErrorMessages` slot and find migration guidance without application-specific components.
  - Verify: pnpm --dir playgrounds/docs build && ! rg -n "BaseField|as=\"li\"|as=\"span\"" playgrounds/docs

## 3. Localisation model

- [x] T03 Rewrite localisation guidance and reference material as a progressive issue-to-identifier-to-resolver-to-string pipeline, including generic and form-specific Vue I18n keys, custom identifiers, missing-key testing and the library-neutral resolver seam.
  - Depends on: none
  - Writes: playgrounds/docs/guide/localisation.md, playgrounds/docs/guide/reference/messages.md, packages/vue-i18n/README.md
  - Locks: none
  - Acceptance: Readers can configure the simplest global translation, understand prefix precedence and interpolation, create a local override, detect exercised missing keys and implement another locale-library resolver without schema-local translation calls.
  - Verify: pnpm --filter @verific/vue-i18n test && pnpm --filter @verific/vue-i18n typecheck && pnpm --dir playgrounds/docs build

## 4. Integration and interface reference

- [x] T04 Consolidate Nuxt guidance, add a complete `useValidation` reference, and shorten package/root READMEs to canonical entry points without duplicating advanced guides.
  - Depends on: none
  - Writes: README.md, packages/core/README.md, packages/nuxt/README.md, playgrounds/docs/guide/nuxt.md, playgrounds/docs/guide/reference/use-validation.md
  - Locks: none
  - Acceptance: The three runtime exports, controller overloads/options/results/path rules/lifecycle, Nuxt automatic/manual modes and supported versions are discoverable and accurate; package READMEs point to the canonical site.
  - Verify: pnpm --filter @verific/core typecheck && pnpm --filter @verific/nuxt typecheck && pnpm --dir playgrounds/docs build

## 5. Integrated verification

- [x] T05 Verify the complete documentation and component change, then inspect the live site for navigation, code rendering and broken links.
  - Depends on: T02, T03, T04
  - Writes: none
  - Locks: docs-navigation, docs-dev-server
  - Acceptance: OpenSpec is strict-valid, core tests and type-check pass, Vue/Nuxt examples type-check, VitePress builds, and the local site presents every new page through the sidebar with no broken internal links.
  - Verify: pnpm --filter @verific/core test && pnpm --filter @verific/core typecheck && pnpm --filter verific-vue build && pnpm --dir playgrounds/nuxt exec nuxi typecheck && pnpm --dir playgrounds/docs build && openspec validate clarify-documentation --type change --strict --json --no-interactive
