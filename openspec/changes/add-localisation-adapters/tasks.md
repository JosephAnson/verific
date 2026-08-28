## 1. Dependency and package topology

- [x] T01 Add the new package manifests, aligned workspace dependencies, release/build configuration and frozen lockfile.
  - Depends on: none
  - Writes: package.json, pnpm-workspace.yaml, pnpm-lock.yaml, Dockerfile, packages/i18n/package.json, packages/i18n/tsconfig.json, packages/i18n/vitest.config.mts, packages/i18next/package.json, packages/i18next/tsconfig.json, packages/i18next/vitest.config.mts, packages/paraglide/package.json, packages/paraglide/tsconfig.json, packages/paraglide/vitest.config.mts, packages/vue-i18n/package.json
  - Locks: dependency-manifest
  - Estimate: medium
  - Acceptance: All Verific packages are version-aligned; each leaf declares only its actual runtime peers; i18next 26 and Paraglide 2 are pinned for tests; Docker and release commands include every publishable package; the lockfile installs frozen.
  - Verify changed: pnpm install --frozen-lockfile
  - Verify: pnpm outdated -r --format json && pnpm audit

## 2. Shared catalogue module

- [x] T02 Add the additive core attempt carrier and implement the shared `@verific/i18n` catalogue module with contract tests.
  - Depends on: T01
  - Writes: packages/core/src/messages.ts, packages/core/tests/messages.test.ts, packages/i18n/src/**, packages/i18n/tests/**, packages/i18n/README.md
  - Locks: localisation-message-contract
  - Estimate: large
  - Acceptance: Legacy singular attempts and new ordered attempt arrays compose; key-first resolution, custom keys, interpolation/count, empty messages, all missing policies, later-resolver suppression and bounded instance-local deduplication pass through the public interfaces.
  - Verify changed: pnpm --filter @verific/core test && pnpm --filter @verific/i18n test && pnpm --filter @verific/core typecheck && pnpm --filter @verific/i18n typecheck
  - Verify: pnpm --filter @verific/core build && pnpm --filter @verific/i18n build

## 3. First-party adapters

- [x] T03 Refactor `@verific/vue-i18n` onto the shared catalogue module without changing `vueI18nMessages()`.
  - Depends on: T02
  - Writes: packages/vue-i18n/src/**, packages/vue-i18n/tests/**, packages/vue-i18n/README.md
  - Locks: vue-i18n-adapter
  - Estimate: medium
  - Acceptance: Existing global/local Composer behaviour remains compatible; selected-locale lookup, fallback order, pluralisation, diagnostics, locale reactivity and packed declarations match the shared contract.
  - Verify changed: pnpm --filter @verific/vue-i18n test && pnpm --filter @verific/vue-i18n typecheck
  - Verify: pnpm --filter @verific/vue-i18n build

- [x] T04 Implement `@verific/i18next` for caller-owned i18next 26 instances and i18next-vue applications.
  - Depends on: T02
  - Writes: packages/i18next/src/**, packages/i18next/tests/**, packages/i18next/README.md
  - Locks: i18next-adapter
  - Estimate: large
  - Acceptance: Exact language chains use `lngs`, count-aware lookup honours configured namespaces, four event sources reactively invalidate errors, `dispose()` removes only this adapter's listeners, and isolated instances cannot leak locale or diagnostics.
  - Verify changed: pnpm --filter @verific/i18next test && pnpm --filter @verific/i18next typecheck
  - Verify: pnpm --filter @verific/i18next build

- [x] T05 Implement `@verific/paraglide` for explicit maps of real generated Paraglide 2 message functions.
  - Depends on: T02
  - Writes: packages/paraglide/src/**, packages/paraglide/tests/**, packages/paraglide/README.md
  - Locks: paraglide-adapter
  - Estimate: large
  - Acceptance: Real generated functions type-check without widened caller casts; the explicit map remains tree-shakeable; required reactive/request-owned locale input, interpolation/count, fallback and SSR isolation pass.
  - Verify changed: pnpm --filter @verific/paraglide test && pnpm --filter @verific/paraglide typecheck
  - Verify: pnpm --filter @verific/paraglide build

## 4. Documentation and examples

- [x] T06 Replace migration history with a dedicated Localisation adapters section and checked copy-ready examples.
  - Depends on: T03, T04, T05
  - Writes: playgrounds/docs/.vitepress/config.mts, playgrounds/docs/guide/localisation.md, playgrounds/docs/guide/localisation/**, playgrounds/docs/guide/nuxt.md, playgrounds/docs/guide/reference/messages.md, playgrounds/docs/scripts/check-docs.mjs, playgrounds/docs/package.json, packages/vue-i18n/README.md, packages/i18next/README.md, packages/paraglide/README.md
  - Locks: docs-localisation-content
  - Estimate: large
  - Acceptance: Overview, Vue I18n, i18next, Paraglide and custom-driver pages are discoverable; examples use destructured validation members, request-safe Nuxt guidance, strict missing-key tests and exact compatibility data; no migration route remains.
  - Verify changed: pnpm --dir playgrounds/docs test && pnpm exec eslint playgrounds/docs packages/vue-i18n/README.md packages/i18next/README.md packages/paraglide/README.md --max-warnings 0
  - Verify: pnpm --dir playgrounds/docs check

## 5. Release integration

- [x] T07 Extend coverage and packed-consumer gates to every adapter and its real supported runtime.
  - Depends on: T03, T04, T05, T06
  - Writes: package.json, Dockerfile, vitest.config.ts, packages/nuxt/tests/packed-consumer.mjs, playgrounds/docs/package.json, pnpm-lock.yaml
  - Locks: release-gates, dependency-manifest
  - Estimate: large
  - Acceptance: ESM, CJS and declarations load from every tarball in clean consumers; docs compile against packed packages; real i18next and generated Paraglide fixtures pass; core-only and single-adapter consumers do not install unrelated locale libraries.
  - Verify changed: pnpm install --frozen-lockfile && pnpm test:coverage && pnpm --filter @verific/nuxt test:integration
  - Verify: pnpm check

## 6. Integrated verification

- [x] T08 Verify the complete adapter release surface and live documentation flows.
  - Depends on: T07
  - Writes: none
  - Locks: docs-dev-server
  - Estimate: medium
  - Acceptance: Full gates and strict OpenSpec pass; live Vue I18n, i18next and Paraglide examples resolve, switch locale without schema reruns, report missing keys as documented and remain accessible at desktop and mobile widths.
  - Verify changed: pnpm check
  - Verify: openspec validate add-localisation-adapters --type change --strict --json --no-interactive
