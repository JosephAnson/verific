## 1. Documentation experience

- [x] T01 Repair the canonical onboarding journey, task-oriented home/guide entry points and theme contrast.
  - Depends on: none
  - Writes: playgrounds/docs/.vitepress/config.mts, playgrounds/docs/.vitepress/theme/style.css, playgrounds/docs/index.md, playgrounds/docs/guide/index.md
  - Locks: docs-navigation, docs-theme
  - Estimate: medium
  - Acceptance: Getting Started is active at its canonical route, advances to a different intended page, home/guide entry points describe four reader tasks, and light/dark link and focus tokens meet the documented contrast contract.
  - Verify changed: pnpm exec eslint playgrounds/docs/.vitepress/config.mts playgrounds/docs/index.md playgrounds/docs/guide/index.md --max-warnings 0
  - Verify: pnpm --dir playgrounds/docs build

- [x] T02 Turn localisation and Nuxt into accessible progressive workflows, moving advanced localisation customisation out of the beginner path.
  - Depends on: none
  - Writes: playgrounds/docs/guide/localisation.md, playgrounds/docs/guide/localisation/customisation.md, playgrounds/docs/guide/nuxt.md, playgrounds/docs/guide/reference/messages.md
  - Locks: docs-localisation
  - Estimate: large
  - Acceptance: A first-time reader can configure shared translations and copy an accessible localised form before encountering advanced customisation; Nuxt's complete forms use the same field/error contract; custom normalisers, local Composers, custom keys and alternate resolvers remain directly discoverable.
  - Verify changed: pnpm exec eslint playgrounds/docs/guide/localisation.md playgrounds/docs/guide/localisation/customisation.md playgrounds/docs/guide/nuxt.md playgrounds/docs/guide/reference/messages.md --max-warnings 0
  - Verify: pnpm --filter @verific/vue-i18n typecheck && pnpm --filter @verific/nuxt typecheck && pnpm --dir playgrounds/docs build

- [x] T03 Add accessible product-specific concept flows for descendant scope composition and issue-to-error ownership boundaries.
  - Depends on: none
  - Writes: playgrounds/docs/guide/core/nested-validation.md, playgrounds/docs/guide/core/issues-and-errors.md
  - Locks: docs-core-concepts
  - Estimate: medium
  - Acceptance: Both concepts are taught through semantic ordered visuals with complete text reading order, no colour-only meaning and direct links to the next relevant task.
  - Verify changed: pnpm exec eslint playgrounds/docs/guide/core/nested-validation.md playgrounds/docs/guide/core/issues-and-errors.md --max-warnings 0
  - Verify: pnpm --dir playgrounds/docs build

- [x] T04 Distil the `useValidation` reference into a compact member index and a separately navigable lifecycle/concurrency reference.
  - Depends on: none
  - Writes: playgrounds/docs/guide/reference/use-validation.md, playgrounds/docs/guide/reference/validation-lifecycle.md
  - Locks: docs-api-reference
  - Estimate: medium
  - Acceptance: Common scope members and registration-only state are recognisable without scrolling through lifecycle detail; output, path, disposal, concurrency and failure semantics remain accurate and directly linked.
  - Verify changed: pnpm exec eslint playgrounds/docs/guide/reference/use-validation.md playgrounds/docs/guide/reference/validation-lifecycle.md --max-warnings 0
  - Verify: pnpm --filter @verific/core typecheck && pnpm --dir playgrounds/docs build

## 2. Regression protection and integrated quality

- [x] T05 Add a dependency-free documentation quality checker and wire it into the docs package gate.
  - Depends on: T01, T02, T03, T04
  - Writes: playgrounds/docs/scripts/check-docs.mjs, playgrounds/docs/package.json
  - Locks: docs-quality-gate
  - Estimate: medium
  - Acceptance: The checker covers navigation membership, internal links/anchors, Getting Started progression and complete-form accessibility markers, and it fails on focused temporary fixture mutations for each protected regression.
  - Verify changed: pnpm exec eslint playgrounds/docs/scripts/check-docs.mjs playgrounds/docs/package.json --max-warnings 0
  - Verify: pnpm --dir playgrounds/docs check && pnpm --dir playgrounds/docs build

- [x] T06 Verify the complete experience in production and live desktop/mobile rendering.
  - Depends on: T05
  - Writes: none
  - Locks: docs-dev-server
  - Estimate: medium
  - Acceptance: Strict OpenSpec validation, lint, documentation checks and production build pass; browser inspection confirms correct first-page progression, dark-mode contrast, accessible examples, readable concept flows, no page-wide overflow at 320 CSS pixels and no console errors.
  - Verify changed: node /Users/josephanson/.codex/skills/impeccable/scripts/detect.mjs --json playgrounds/docs
  - Verify: pnpm --dir playgrounds/docs check && pnpm exec eslint playgrounds/docs --max-warnings 0 && pnpm --dir playgrounds/docs build && openspec validate maximise-documentation-quality --type change --strict --json --no-interactive
