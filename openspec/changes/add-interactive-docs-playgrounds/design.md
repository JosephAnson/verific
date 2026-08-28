## Context

The VitePress site currently renders static examples and has no page-local Vue example components or example interaction tests. The publishable workspace packages resolve from built `dist` entries, while the documentation Docker image currently copies and builds only the core package manifest and documentation source.

## Goals / Non-Goals

**Goals:**

- Make the three most important Verific behaviours observable where they are taught.
- Keep runnable code, displayed source and tests tied to one implementation.
- Preserve the documentation's restrained reading-first visual system.
- Keep all examples usable through semantic controls at narrow widths.

**Non-Goals:**

- Embedding a browser IDE, iframe or WebContainer.
- Reimplementing the Nuxt module inside VitePress.
- Adding an interactive example to every reference page.
- Adding a fourth validator-switching example before the three primary workflows are proven.

## Decisions

### Page-local Vue SFC imports

Examples live under `.vitepress/examples` and are imported by the Markdown pages that teach them. This keeps the component dependency surface local and avoids globally registering examples on every route. VitePress `<<<` source imports display the same SFC files.

Alternatives considered: global theme registration adds unnecessary global surface; iframes and browser IDEs add loading, isolation and maintenance costs without improving the basic interaction.

### Three canonical examples

Getting Started owns basic validation, Scopes owns descendant registration and disposal, and Localisation owns locale reactivity. Other pages link to these examples instead of duplicating behaviour. Nuxt retains the existing real application playground because only it exercises module registration and auto-imports.

### Real runtime dependencies

The documentation package declares workspace core and adapter packages plus Vue, Vue I18n and Zod directly. The localisation example creates a Composer per component instance and passes its adapter at registration level, avoiding SSR-shared locale state and avoiding mutation of VitePress's app plugin graph.

### User-centred component tests

A docs-specific Vitest configuration compiles the SFCs and runs interaction tests in jsdom. Tests exercise observable errors, success, descendant disposal and locale updates without revalidation. The documentation check runs these tests before the production build.

### Shared example presentation

Examples use one `.verific-example` visual vocabulary based on existing VitePress tokens: a quiet bordered work surface, clear field rhythm, native semantic controls and textual status. The layout stays stacked at narrow widths and uses no colour-only state.

## Risks / Trade-offs

- **Workspace packages require built entries during docs builds** → Build core and the Vue I18n adapter before VitePress in Docker and existing root gates.
- **Interactive examples increase client JavaScript** → Limit the site to three page-local demos so only relevant routes load each component.
- **Example source imports can break when files move** → Extend the docs checker to resolve `<<<` imports and scan example SFC templates.
- **Testing tools add development dependencies** → Keep them docs-scoped and use one compact interaction suite.

## Migration Plan

Add dependencies and Docker build inputs, land examples and tests, then enable the expanded docs check. Rollback consists of removing the page-local imports/components and restoring the previous docs package dependency set.
