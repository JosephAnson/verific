## Why

Verific's documentation is accurate but asks readers to infer the library's mental model from several feature-led pages. First-time users need a shorter path from installation to a working form, followed by a predictable explanation of scopes, validation results, error selection and localisation.

## What Changes

- Reorganise the VitePress navigation around learning, core concepts, localisation, integrations and reference.
- Rewrite the getting-started path as a progressive, runnable Vue example with explicit model ownership and submission flow.
- Introduce one canonical conceptual model and use the same terms throughout every guide.
- Separate raw issues, resolved error strings and transformed schema output so their purposes are immediately clear.
- Rework localisation documentation from the common Vue I18n setup through key resolution, fallbacks, missing-key checks and other adapter implementations.
- Add concise reference pages for `useValidation`, plugin configuration, message resolution and supported integrations.
- Reduce duplicated examples and convert recipe pages into focused extensions of the canonical form.
- Replace `ErrorMessages`' element-selection prop with a required scoped slot so callers own the rendered element and styling.
- Prefer destructured controller methods in simple examples while documenting the complete controller in reference pages.

## Capabilities

### New Capabilities

- `scoped-error-rendering`: `ErrorMessages` normalises supported message inputs and exposes each message through a required scoped slot without choosing presentation markup.

### Modified Capabilities

None.

## Impact

The VitePress information architecture, guide content, package READMEs and documentation examples will change. `ErrorMessages` has a breaking rendering-interface change, covered by core component tests and documentation examples. Documentation builds and example type-checks remain acceptance gates.
