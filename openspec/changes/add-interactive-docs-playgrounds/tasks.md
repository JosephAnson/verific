## 1. Runtime and build foundation

- [x] T01 Declare documentation runtime/test dependencies and make local, Docker and release builds compile the workspace examples.
  - Depends on: none
  - Writes: playgrounds/docs/package.json, pnpm-lock.yaml, Dockerfile
  - Locks: dependency-manifest
  - Estimate: medium
  - Acceptance: The docs package resolves core, adapter, Vue, Vue I18n, Zod and its test tooling directly; Docker builds core and adapter before VitePress; docs check includes example tests.
  - Verify changed: pnpm install --frozen-lockfile
  - Verify: docker build --target build .

## 2. Runnable examples

- [x] T02 Implement the three accessible inline Vue examples and their shared responsive presentation.
  - Depends on: none
  - Writes: playgrounds/docs/.vitepress/examples/**, playgrounds/docs/.vitepress/theme/style.css
  - Locks: docs-example-components
  - Estimate: large
  - Acceptance: Basic validation, descendant scope disposal and locale switching run through the real public APIs; controls and outcomes are accessible; no example creates page-level overflow at 320 CSS pixels.
  - Verify changed: pnpm exec eslint playgrounds/docs/.vitepress/examples --max-warnings 0
  - Verify: pnpm --dir playgrounds/docs build

## 3. Inline teaching flow

- [x] T03 Embed each example beside its concept, import the same component source for disclosure, and link Nuxt readers to the real application playground.
  - Depends on: T02
  - Writes: playgrounds/docs/guide/index.md, playgrounds/docs/guide/core/nested-validation.md, playgrounds/docs/guide/localisation.md, playgrounds/docs/guide/core/issues-and-errors.md, playgrounds/docs/guide/components/error-messages.md, playgrounds/docs/guide/nuxt.md
  - Locks: docs-example-content
  - Estimate: medium
  - Acceptance: Three runnable examples appear at the intended teaching points; source disclosures resolve to their SFCs; secondary pages link to canonical demos; Nuxt accurately describes how to run its real playground.
  - Verify changed: pnpm exec eslint playgrounds/docs/guide --max-warnings 0
  - Verify: pnpm --dir playgrounds/docs build

## 4. Regression coverage

- [x] T04 Add user-centred interaction tests and extend the docs checker to validate example source imports and accessible SFC forms.
  - Depends on: T01, T02, T03
  - Writes: playgrounds/docs/vitest.config.mts, playgrounds/docs/.vitepress/examples/examples.check.ts, playgrounds/docs/scripts/check-docs.mjs
  - Locks: docs-quality-gate
  - Estimate: large
  - Acceptance: Tests prove invalid/valid submission, aggregate descendant issues and immediate disposal, and locale changes without a second validation; broken source imports or inaccessible example controls fail the docs gate.
  - Verify changed: pnpm --dir playgrounds/docs test
  - Verify: pnpm --dir playgrounds/docs check

## 5. Integrated verification

- [x] T05 Verify production, desktop/mobile interaction and release readiness.
  - Depends on: T04
  - Writes: none
  - Locks: docs-dev-server
  - Estimate: medium
  - Acceptance: Strict OpenSpec, the root gate and the Impeccable detector pass; browser checks exercise all three examples in light/dark themes at desktop and 320 CSS pixels with no console errors or page overflow.
  - Verify changed: node /Users/josephanson/i/ai-config/skills/impeccable/scripts/detect.mjs --json playgrounds/docs
  - Verify: pnpm check && openspec validate add-interactive-docs-playgrounds --type change --strict --json --no-interactive
