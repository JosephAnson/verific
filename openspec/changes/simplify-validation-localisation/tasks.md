## Implementation

- [x] T01 Replace the core validation surface with implicit composition, lossless issues and locale-neutral message resolution.
  - Depends on: none
  - Writes: packages/core/src/**, packages/core/tests/**, packages/core/package.json, packages/core/tsconfig.json
  - Locks: core-public-contract
  - Acceptance: `useValidation()` creates or joins scopes as specified, supports independent nested scopes and registration prefixes, preserves atomic Standard Schema results and concurrency guarantees, exposes exact-path issue selectors and reactive resolved-message selectors, supports Zod and Valibot semantic normalisation, works without `createVerific()`, and exports only the documented public contract.
  - Verify: pnpm --filter @verific/core test && pnpm --filter @verific/core typecheck && pnpm --filter @verific/core build

- [x] T02 Add and package the framework-neutral Vue I18n message adapter.
  - Depends on: T01
  - Writes: packages/vue-i18n/**, packages/core/src/messages.ts, packages/core/tests/**, package.json, pnpm-workspace.yaml, pnpm-lock.yaml
  - Locks: dependency-manifest
  - Acceptance: `@verific/vue-i18n` implements catalogue-aware key lookup, locale fallback, interpolation, pluralisation, configurable missing-key handling and per-adapter diagnostic deduplication without adding Vue I18n to core; a clean packed consumer can import and execute it.
  - Verify: pnpm install --frozen-lockfile && pnpm --filter @verific/core test && pnpm --filter @verific/core typecheck && pnpm --filter @verific/vue-i18n test && pnpm --filter @verific/vue-i18n typecheck && pnpm --filter @verific/vue-i18n build

- [x] T03 Integrate request-local message resolution into the Nuxt module.
  - Depends on: T02
  - Writes: packages/nuxt/src/**, packages/nuxt/tests/**, packages/nuxt/package.json, packages/nuxt/tsconfig.json
  - Locks: nuxt-runtime-contract
  - Acceptance: serialisable Nuxt options select the Vue I18n adapter, automatic plugins bind only to the current Composition API `$i18n`, plugin ordering handles parallel Nuxt I18n initialisation, `global: false` remains a complete opt-out, only `useValidation` is auto-imported, and packed Nuxt 3.21 and Nuxt 4 consumers cover automatic and manual SSR paths.
  - Verify: pnpm --filter @verific/nuxt test && pnpm --filter @verific/nuxt typecheck && pnpm --filter @verific/nuxt build && pnpm --filter @verific/nuxt test:integration

- [x] T04 Migrate playgrounds and documentation to the unified validation and localisation API.
  - Depends on: T03
  - Writes: README.md, packages/core/README.md, packages/nuxt/README.md, playgrounds/vue/**, playgrounds/nuxt/**, playgrounds/docs/**, pnpm-lock.yaml
  - Locks: dependency-manifest
  - Acceptance: Vue and Nuxt examples use one root `useValidation()` scope, descendant registration, ready-to-render localised error arrays, message prefixes and locale switching; quick starts, API concepts, migration guidance and compatibility tables contain no legacy APIs and all examples type-check or build.
  - Verify: pnpm --dir playgrounds/vue build && pnpm --dir playgrounds/nuxt exec nuxi typecheck && pnpm --dir playgrounds/nuxt build && pnpm --dir playgrounds/docs build

- [x] T05 Complete release confidence, dependency upgrades and packed-consumer gates.
  - Depends on: T04
  - Writes: .github/**, Dockerfile, CONTRIBUTING.md, package.json, pnpm-workspace.yaml, pnpm-lock.yaml, eslint.config.mjs, tsconfig.json, vitest.config.ts, .node-version
  - Locks: dependency-manifest, release-gates
  - Acceptance: CI exercises tests, type-checks, coverage, playgrounds, docs and packed core, adapter and Nuxt consumers; every workspace dependency is at the latest compatible release with incompatible licences or majors explicitly assessed; the pinned Node and pnpm toolchain installs reproducibly; audit and outdated checks are clean or have a documented upstream exception.
  - Verify: corepack pnpm install --frozen-lockfile && corepack pnpm outdated -r --format json && corepack pnpm audit && corepack pnpm check && openspec validate simplify-validation-localisation --strict

- [x] T06 Harden publication, deployment and package-level developer experience.
  - Depends on: T05
  - Writes: package.json, packages/core/package.json, packages/vue-i18n/**, packages/nuxt/package.json, packages/nuxt/tests/packed-consumer.mjs, pnpm-lock.yaml, .github/workflows/deploy.yml, README.md, packages/core/README.md, packages/nuxt/README.md, playgrounds/vue/**, playgrounds/nuxt/**, playgrounds/docs/**
  - Locks: dependency-manifest, release-gates
  - Acceptance: every publishable package has an unpublished coordinated release version and compatible internal peer ranges; the root release command bumps workspace packages together; deployment runs only for the exact successful main push commit; packed runtime tests avoid random-port collisions and assert the adapter README is published; examples render preserved duplicate messages with stable unique keys.
  - Verify: corepack pnpm install --frozen-lockfile && corepack pnpm check && corepack pnpm --filter @verific/vue-i18n pack --pack-destination /tmp/verific-pack-check && openspec validate simplify-validation-localisation --strict

- [x] T07 Close core behavioural verification gaps.
  - Depends on: T06
  - Writes: packages/core/tests/**
  - Locks: core-test-suite
  - Acceptance: tests prove normaliser precedence, inheritance, duplicate suppression and reset; late stale validator fulfilment and rejection after supersession or disposal cannot mutate state or become unhandled; committed descendant issues disappear immediately on disposal; and namespace plus generated-function-map resolver configurations produce localised messages.
  - Verify: corepack pnpm --filter @verific/core test && corepack pnpm --filter @verific/core typecheck && openspec validate simplify-validation-localisation --strict

- [x] T08 Close Nuxt request-isolation and locale-reactivity verification gaps.
  - Depends on: T06
  - Writes: packages/nuxt/tests/**
  - Locks: nuxt-test-harness
  - Acceptance: tests prove concurrent packed SSR requests can use different locales without leaking resolver state or missing diagnostics, and a client-side locale change updates resolved messages without invoking the validation schema again.
  - Verify: corepack pnpm --filter @verific/nuxt test && corepack pnpm --filter @verific/nuxt test:integration && corepack pnpm check && openspec validate simplify-validation-localisation --strict

- [x] T09 Preserve newest-run authority across synchronous capture failures.
  - Depends on: T08
  - Writes: packages/core/src/composables/useValidation.ts, packages/core/tests/useValidation.test.ts
  - Locks: core-public-contract
  - Acceptance: when synchronous schema/model capture starts a newer validation and then throws, the superseded caller adopts the newer result while an authoritative capture failure still rejects with its original error.
  - Verify: corepack pnpm --filter @verific/core test && corepack pnpm --filter @verific/core typecheck && openspec validate simplify-validation-localisation --strict

- [x] T10 Make browser production missing-message defaults reliable.
  - Depends on: T08
  - Writes: packages/vue-i18n/src/main.ts, packages/vue-i18n/tests/**
  - Locks: vue-i18n-adapter
  - Acceptance: omitting the missing-message policy warns in development and stays silent in browser production builds without relying on a global process object, while explicit warn and silent options remain authoritative.
  - Verify: corepack pnpm --filter @verific/vue-i18n test && corepack pnpm --filter @verific/vue-i18n typecheck && corepack pnpm --filter @verific/vue-i18n build && openspec validate simplify-validation-localisation --strict

- [x] T11 Select a unique coordinated release version and tag.
  - Depends on: T08
  - Writes: package.json, packages/core/package.json, packages/vue-i18n/package.json, packages/nuxt/package.json, pnpm-lock.yaml
  - Locks: dependency-manifest, release-gates
  - Acceptance: root and all publishable packages use the same unpublished version whose `v<version>` tag does not exist remotely; packed internal peer ranges resolve to that version; the configured release and publish workflows can create and consume the unique tag without rewriting history.
  - Verify: corepack pnpm install --frozen-lockfile && corepack pnpm --filter @verific/nuxt test:integration && corepack pnpm check && openspec validate simplify-validation-localisation --strict
