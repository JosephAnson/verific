## Context

See `proposal.md` for motivation. Verific now has one deep validation interface, `useValidation`, plus optional seams for message resolution and rendering. The current site documents the features accurately, but navigation follows implementation categories, terminology is introduced late, and examples duplicate setup while omitting a complete interface reference.

The rewrite must preserve existing URLs where practical, keep every example compatible with the current packages, and coexist with the uncommitted validation-library work already in the repository.

## Goals / Non-Goals

**Goals:**

- Teach one model: a scope coordinates registrations; schemas produce issues; resolvers turn issues into error strings; callers own rendering.
- Give Vue and Nuxt readers a working path before advanced configuration.
- Make `useValidation` the centre of the narrative and keep adapters/renderers optional.
- Give localisation a progressive path from raw schema messages to generic translations, form-specific overrides, custom identifiers and missing-key checks.
- Make public options, return values, path behaviour and failure modes discoverable without reading source.

**Non-Goals:**

- Change validation scope, message-resolution or Nuxt behaviour.
- Add adapters for localisation libraries that are not currently shipped.
- Introduce a documentation framework or visual redesign.
- Treat `ErrorMessages` as the preferred rendering path; arrays remain the simplest interface.

## Decisions

### 1. Organise the site by the reader's journey

The sidebar will use Start, Core concepts, Localisation, Integrations and Reference. Existing guide URLs remain where their subjects still fit, while new reference pages own detail currently compressed into Getting Started.

This is preferred to package-led navigation because readers first need the mental model, not the repository structure.

### 2. Use a single canonical Vue form

The primary example uses one reactive application-owned model, one Standard Schema schema and destructured `validate`/`errorsFor` methods. It states that unlocalised errors use schema prose and that validation must be awaited.

The full controller object appears only where controller state is being taught. This keeps the first interface small without hiding the richer reference surface.

### 3. Establish canonical domain language

The documentation and a root glossary will consistently use:

- **scope**: the group validated together;
- **registration**: one schema/model pair in a scope;
- **issue**: structured validation information;
- **error**: a ready-to-render string derived from an issue;
- **semantic identifier**: locale-independent meaning such as `invalidEmail`;
- **message resolver**: a function or adapter that can resolve that meaning;
- **locale adapter**: a resolver implementation at a locale-library seam.

Avoid using “message” alone when “schema message”, “translation catalogue”, or “message resolver” is meant.

### 4. Teach localisation as a pipeline

The canonical order is schema issue → validation issue → semantic identifier and values → resolver → error string. The simplest Vue I18n example starts with a shared `errors` catalogue only; a later example introduces form-specific `messagePrefix` overrides. Nuxt documentation explains only its serialisable, request-local wiring and links back to the canonical concepts.

The docs will explicitly distinguish runtime missing-key checks from static catalogue typing and locale-parity checks.

### 5. Make `ErrorMessages` renderless

`ErrorMessages` retains normalisation but removes the `as` prop and attribute forwarding. Its required default slot receives `{ message, index }` for each normalised string and owns the element, attributes and accessibility semantics. Rendering without a slot produces no markup.

This creates a deeper module: Verific owns the non-trivial message-input normalisation while callers retain presentation. It is preferred to choosing an element via a prop because the latter still constrains component structure and slot behaviour.

### 6. Keep examples framework-neutral unless the page is an integration

The docs will not reference application-specific components such as `BaseField`. Rendering examples use native HTML or explicitly labelled illustrative custom components. Nuxt and Vue I18n details remain on their integration pages.

## Risks / Trade-offs

- **Breaking `ErrorMessages` callers that use `as`** → document the migration with a before/after example and cover the new slot contract with component tests.
- **More pages can increase navigation cost** → keep one owner page per concept, link rather than repeat, and use concise reference tables.
- **Destructuring can obscure reactive refs** → destructure methods in the quickstart but document that `issues`, `errors`, `result` and `isValidating` are refs in the interface reference.
- **Examples can drift from types** → run core tests/type-check, Vue and Nuxt type-checks, and the VitePress build as integrated gates.
