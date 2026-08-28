## Purpose

Defines a dependable, accessible and task-oriented documentation experience that teaches Verific's distinctive concepts before exposing advanced reference detail.

## ADDED Requirements

### Requirement: Guided first-use journey
The documentation site MUST provide one canonical Getting Started route, identify the reader's current location, and advance to a different next step that continues the learning journey.

#### Scenario: Reader completes Getting Started
- **WHEN** a reader reaches the end of Getting Started
- **THEN** the page presents a next-page link to the intended subsequent concept rather than linking to itself
- **AND** the corresponding navigation item is visibly active

### Requirement: Production-accessible form examples
Every copyable form example that renders validation errors MUST associate its controls and error content with equivalent accessible semantics, and MUST allow Verific's submit handler to run without native constraint validation intercepting it.

#### Scenario: Reader copies a validation form
- **WHEN** a guide presents a complete validation form with field errors
- **THEN** the form uses `novalidate`
- **AND** each demonstrated field exposes its invalid state and describes its error container
- **AND** dynamically rendered errors use an appropriate announcement strategy

#### Scenario: Guide intentionally shows a fragment
- **WHEN** a code block omits the surrounding accessible form contract to focus on one API detail
- **THEN** the guide labels the block as a partial replacement or addition
- **AND** links or refers directly to the complete accessible example it extends

### Requirement: Task-oriented entry points
The documentation MUST offer clear entry paths for validating one form, composing descendant registrations, rendering or localising errors, and using Nuxt.

#### Scenario: Reader arrives without knowing an API name
- **WHEN** the reader scans the home or Getting Started page
- **THEN** they can choose a path described by their intended task rather than having to infer the relevant API section

### Requirement: Accessible conceptual teaching
The documentation MUST explain scope composition and message resolution with compact semantic visuals whose information remains available as text and does not depend on colour alone.

#### Scenario: Reader learns scope composition
- **WHEN** the reader opens the scopes guide
- **THEN** they encounter a visual sequence showing a parent scope collecting descendant registrations
- **AND** the same sequence is understandable to assistive technology

#### Scenario: Reader learns message resolution
- **WHEN** the reader opens localisation guidance
- **THEN** they encounter a visual sequence from schema issue through semantic description and resolver to rendered error
- **AND** the same sequence is understandable to assistive technology

### Requirement: Progressive disclosure of advanced material
Beginner guides MUST prioritise setup and one successful workflow, while advanced customisation and lifecycle detail MUST remain discoverable on separately navigable pages or concise reference sections.

#### Scenario: Reader configures localisation for the first time
- **WHEN** the reader follows the primary localisation guide
- **THEN** they can complete shared translations and render an accessible localised form without traversing custom normalisers, local Composer constraints or alternate-library integration

#### Scenario: Returning reader looks up an API member
- **WHEN** the reader opens the `useValidation` reference
- **THEN** a compact member index distinguishes common scope members from registration-only state
- **AND** advanced lifecycle and concurrency behaviour remains directly linked

### Requirement: Readable themed presentation
Normal-size text links MUST meet WCAG AA contrast in both light and dark themes, and documentation content MUST remain usable at supported mobile widths without page-wide horizontal overflow.

#### Scenario: Reader uses dark mode
- **WHEN** inline links are displayed against the dark article background
- **THEN** their normal-state contrast ratio is at least 4.5:1
- **AND** focus and hover states remain distinguishable without relying on colour alone

#### Scenario: Reader uses a narrow viewport
- **WHEN** the viewport is 320 CSS pixels wide
- **THEN** the page itself does not overflow horizontally
- **AND** long source code scrolls within its code container

### Requirement: Documentation regression checks
The repository MUST provide a repeatable documentation check that detects broken internal navigation, self-referential progression, inaccessible complete-form patterns and production build failures.

#### Scenario: Documentation is prepared for release
- **WHEN** the documentation quality gate runs
- **THEN** it verifies internal routes and anchors represented in navigation
- **AND** rejects a Getting Started next-page self-link
- **AND** rejects complete validation forms that omit the documented accessibility contract
- **AND** builds the VitePress site successfully
