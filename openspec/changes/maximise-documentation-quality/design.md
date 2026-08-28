## Context

See `proposal.md` for motivation and `specs/documentation-experience/spec.md` for the observable contract. The site uses VitePress's default theme with a small custom colour layer. The current content is accurate, the mobile shell is sound, and runtime APIs must remain unchanged. The defects are concentrated in route canonicalisation, example consistency, information density and the absence of a visual teaching language.

## Goals / Non-Goals

**Goals:**

- Preserve the existing quiet, technical reading experience while making it recognisably Verific.
- Make the shortest copyable workflow production-accessible.
- Separate activation material from advanced customisation without hiding reference detail.
- Add checks for the exact regressions found by independent critique.

**Non-Goals:**

- Replacing VitePress or introducing a documentation framework dependency.
- Adding interactive playground infrastructure, analytics or runtime API features.
- Treating a subjective critique score as a release gate.
- Redesigning the logo or changing the established purple/green identity.

## Decisions

### Preserve VitePress and deepen its theme

The implementation will retain the default VitePress layout, navigation and responsive behaviour. A small token and content-pattern layer will correct contrast and introduce Verific-specific concept flows. Replacing the theme would risk accessibility and responsive regressions without improving the learning contract.

### Use semantic HTML for concept diagrams

Scope composition and message resolution will use ordered semantic markup styled as connected steps. The DOM reading order will contain the complete explanation; decorative connectors will be CSS-only and hidden from assistive technology. This avoids image maintenance, Mermaid tooling and inaccessible colour-only meaning.

### Organise documentation by reader task

The home and guide entry pages will expose four paths: validate one form, compose nested forms, render/localise errors and integrate with Nuxt. The primary localisation page will end after a successful accessible workflow and core lookup behaviour. Advanced normalisers, local composers, custom keys and other libraries will move to a dedicated customisation page or the message-resolution reference. The `useValidation` page will start with a member index and link lifecycle/concurrency detail to a dedicated reference page.

### Treat every complete form as production copy

A complete form block must include `novalidate`, labels, invalid state, field-to-error association and an announcement container. Focused fragments may omit surrounding code only when explicitly introduced as replacements or additions to the canonical form.

### Add a dependency-free documentation checker

A Node script using built-in filesystem and URL/path utilities will check navigation membership, local Markdown links and anchors, Getting Started progression, and complete-form accessibility markers. VitePress's production build remains the rendering gate. The checker will target authored source rather than generated `.vitepress/dist` output.

### Correct theme contrast with mode-specific tokens

Light and dark brand-link colours will be separate tokens. Solid button tokens may retain a different shade because text-on-solid and text-on-background contrast constraints differ. Focus visibility will include a non-colour cue.

## Risks / Trade-offs

- **Content moves can break inbound anchors** → retain concise bridge links where practical and cover authored internal links in the checker.
- **Repeated accessibility markup makes examples longer** → keep one complete canonical form per journey and label subsequent snippets as focused replacements.
- **Semantic diagrams can become decorative clutter** → limit them to the two concepts identified by critique and preserve a linear text reading order.
- **Default-theme upgrades can change internal selectors** → override documented CSS variables first and keep custom selectors narrow.
- **A static checker can mistake fragments for complete forms** → use explicit documentation conventions and test only blocks containing both `<form` and validation-error selectors.

## Migration Plan

1. Repair routing and theme tokens without moving content.
2. Make form examples consistent and add concept flows.
3. Split advanced pages and update navigation/links.
4. Add the documentation checker and run build, lint, responsive and contrast verification.
5. Keep the previous URLs available or linked wherever content moves.
