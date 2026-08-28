## 1. Core targeted validation

- [x] T01 Add the typed `validateFor` interface, issue ledger and race-safe targeted scheduler with focused core tests.
  - Depends on: none
  - Writes: packages/core/src/composables/useValidation.ts, packages/core/tests/useValidation.test.ts, packages/core/src/main.ts
  - Locks: core-validation-runtime
  - Estimate: large
  - Acceptance: Exact-path updates preserve unrelated issues; full results remain submission-only; disjoint/same-path/full races, failure, disposal, `at`, typing and localisation semantics are covered.
  - Verify changed: pnpm --filter @verific/core test && pnpm --filter @verific/core typecheck
  - Verify: pnpm --filter @verific/core build

## 2. Blur-driven examples and documentation

- [x] T02 Update runnable examples, public guides and reference pages to destructure used members and demonstrate `validateFor` on blur.
  - Depends on: T01
  - Writes: playgrounds/docs/.vitepress/examples/**, playgrounds/docs/guide/**, README.md, packages/core/README.md
  - Locks: docs-validation-content
  - Estimate: medium
  - Acceptance: Basic blur publishes only the field; submit publishes all; all public examples destructure members rather than retaining controller objects unless teaching complete registration state.
  - Verify changed: pnpm --dir playgrounds/docs test && pnpm exec eslint README.md packages/core/README.md playgrounds/docs --max-warnings 0
  - Verify: pnpm --dir playgrounds/docs check

## 3. Integrated verification

- [x] T03 Verify complete release and live browser behaviour.
  - Depends on: T02
  - Writes: none
  - Locks: docs-dev-server
  - Estimate: medium
  - Acceptance: Root checks and strict OpenSpec pass; live browser blur updates one field, submit updates all, rapid field transitions retain both results, and desktop/mobile layouts remain accessible and overflow-free.
  - Verify changed: pnpm check
  - Verify: openspec validate add-targeted-validation --type change --strict --json --no-interactive
