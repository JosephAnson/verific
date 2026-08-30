## 1. Deep core validation modules

- [x] T01 Extract shared path operations, the Issue-to-Error pipeline, Registration observation and Scope lifecycle into deep internal modules, then leave `useValidation` as the thin Vue/prefix adapter.
  - Depends on: none
  - Writes: packages/core/src/composables/useValidation.ts, packages/core/src/validation/paths.ts, packages/core/src/validation/issuePipeline.ts, packages/core/src/validation/registrationObservation.ts, packages/core/src/validation/scope.ts, packages/core/tests/issuePipeline.test.ts, packages/core/tests/useValidation.test.ts
  - Locks: core-validation-internals
  - Estimate: large
  - Acceptance: Public exports and controller types are unchanged; Scope scheduling preserves newest-run authority, distinct pending/unsettled work, atomic publication, disposal and two-phase reset; Registration observation preserves accessor safety, snapshot identity and immediate same-stack dirty, clean, stale, schema-change and exact-path reads without `nextTick()`; Issue construction preserves paths, raw identity, normaliser precedence/de-duplication, Message resolver ownership and immediate lazy Error re-resolution without rerunning schemas.
  - Verify changed: pnpm --filter @verific/core test && pnpm --filter @verific/core typecheck && pnpm exec eslint packages/core/src/composables/useValidation.ts packages/core/src/validation packages/core/tests/issuePipeline.test.ts packages/core/tests/useValidation.test.ts --max-warnings 0
  - Verify: pnpm --filter @verific/core build

## 2. Deep rendered-validation audit

- [x] T02 Extract rendered Vue expansion and form-contract checking behind one deep audit seam while leaving discovery, reporting and the mutation harness in the outer documentation checker.
  - Depends on: none
  - Writes: playgrounds/docs/scripts/check-docs.mjs, playgrounds/docs/scripts/rendered-validation-audit.mjs
  - Locks: docs-rendered-audit
  - Estimate: large
  - Acceptance: Each Markdown snippet and rendered page remains a separate root; parsed-unit caching, reached imported files, lexical loop bindings, slot fallback, cycle detection, canonical paths, symlink protection, ID resolution, accessibility checks, failure text and check order remain intact; all 153 mutation fixtures and the real documentation audit pass; optional, skip and required-group declarations occur in rendered documentation only where the expanded AST or native HTML semantics cannot prove the intent safely.
  - Verify changed: pnpm exec eslint playgrounds/docs/scripts/check-docs.mjs playgrounds/docs/scripts/rendered-validation-audit.mjs --max-warnings 0 && node playgrounds/docs/scripts/check-docs.mjs --self-test && node playgrounds/docs/scripts/check-docs.mjs
  - Verify: pnpm --filter @verific/docs check

## 3. Locale adapter conformance

- [x] T03 Add a shared test-only Locale adapter conformance module and package-local drivers, pruning only duplicated observable-contract cases from vendor suites.
  - Depends on: none
  - Writes: tests/support/localeAdapterConformance.ts, packages/i18n/tests/localeAdapterConformance.test.ts, packages/i18n/tests/createCatalogueMessages.test.ts, packages/i18n/tsconfig.json, packages/i18next/tests/localeAdapterConformance.test.ts, packages/i18next/tests/i18nextMessages.test.ts, packages/i18next/tsconfig.json, packages/vue-i18n/tests/localeAdapterConformance.test.ts, packages/vue-i18n/tests/vueI18nMessages.test.ts, packages/vue-i18n/tsconfig.json, packages/paraglide/tests/localeAdapterConformance.test.ts, packages/paraglide/tests/paraglideMessages.test.ts, packages/paraglide/tsconfig.json
  - Locks: locale-adapter-conformance
  - Estimate: large
  - Acceptance: One shared harness proves key-first ordering, exact selected-locale lookup, immediate reactive Error re-resolution and missing diagnostics through `useValidation`; Vue-ref locale changes are read immediately without `nextTick()`, i18next waits only for `changeLanguage()`, schemas run once, missing callbacks deduplicate, Paraglide's single-locale topology is explicit, and all vendor-specific lookup/lifecycle/typing/SSR checks remain local.
  - Verify changed: pnpm --filter @verific/i18n test && pnpm --filter @verific/i18next test && pnpm --filter @verific/vue-i18n test && pnpm --filter @verific/paraglide test && pnpm exec eslint tests/support packages/i18n/tests packages/i18next/tests packages/vue-i18n/tests packages/paraglide/tests --max-warnings 0
  - Verify: pnpm --filter @verific/i18n typecheck && pnpm --filter @verific/i18next typecheck && pnpm --filter @verific/vue-i18n typecheck && pnpm --filter @verific/paraglide typecheck && pnpm --filter @verific/i18n build && pnpm --filter @verific/i18next build && pnpm --filter @verific/vue-i18n build && pnpm --filter @verific/paraglide build

## 4. Integrated architecture gate

- [x] T04 Integrate the accepted deep modules, resolve only cross-scope regressions and run the complete repository and strict OpenSpec gates.
  - Depends on: T01, T02, T03
  - Writes: packages/core/src/**, packages/core/tests/**, playgrounds/docs/scripts/**, tests/support/**, packages/i18n/tests/**, packages/i18n/tsconfig.json, packages/i18next/tests/**, packages/i18next/tsconfig.json, packages/vue-i18n/tests/**, packages/vue-i18n/tsconfig.json, packages/paraglide/tests/**, packages/paraglide/tsconfig.json, packages/nuxt/tsconfig.json
  - Locks: core-validation-internals, docs-rendered-audit, locale-adapter-conformance
  - Estimate: medium
  - Acceptance: All task revisions coexist without public export or declaration drift; direct validation-state and lazy Error reads require no `nextTick()` while genuine Vue lifecycle/DOM waits remain explicit; the Nuxt package type-check does not traverse another workspace package's tests; full lint, tests, coverage, package type-check/build, playground builds, docs checks, Nuxt integration and strict OpenSpec validation pass.
  - Verify changed: pnpm lint && pnpm packages:typecheck && pnpm test && pnpm build
  - Verify: pnpm test:coverage && pnpm playgrounds:build && pnpm docs:check && pnpm test:integration && openspec validate deepen-validation-architecture --type change --strict --json --no-interactive
