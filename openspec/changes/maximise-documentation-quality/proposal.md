## Why

Verific's documentation is technically accurate and responsive, but its first-time learning journey still breaks, copyable examples apply accessibility inconsistently, and the library's defining concepts remain difficult to scan and visualise. The next release needs documentation that is not merely complete, but dependable as a production-quality teaching surface.

## What Changes

- Repair canonical guide navigation, active state and forward progression.
- Make every copyable validation form use the same accessible field/error contract.
- Split beginner localisation guidance from advanced message-resolution reference material and add a compact `useValidation` member index.
- Add task-oriented entry paths and accessible visual explanations for scope composition and message resolution.
- Introduce theme tokens that preserve Verific's identity while meeting dark-mode link contrast requirements.
- Add automated navigation, accessibility-pattern, link and production-build checks for the documentation.

## Capabilities

### New Capabilities

- `documentation-experience`: Defines the documentation site's onboarding, accessibility, navigation, conceptual teaching and responsive quality contract.

### Modified Capabilities

None.

## Impact

The change affects the VitePress configuration and theme, selected guide/reference Markdown pages, new documentation presentation components, and documentation-focused tests or verification scripts. It does not change Verific's runtime API or published validation behaviour.
