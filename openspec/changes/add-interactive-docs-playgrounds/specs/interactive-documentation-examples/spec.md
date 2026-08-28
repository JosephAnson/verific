## Purpose

Make Verific's central behaviours directly observable inside the documentation through accessible runnable examples whose displayed source and tested implementation stay aligned.

## ADDED Requirements

### Requirement: Inline validation example
The documentation SHALL provide a runnable basic form beside the introductory validation workflow using the real public core API.

#### Scenario: Invalid and valid submission
- **WHEN** a reader submits incomplete data
- **THEN** field errors are displayed and announced with accessible input associations
- **WHEN** the reader corrects the data and submits again
- **THEN** the example displays a successful outcome and clears the errors

### Requirement: Inline scope-composition example
The scope guide SHALL provide a runnable parent form with descendant registrations using the real component-tree scope behaviour.

#### Scenario: Descendants join and leave the parent scope
- **WHEN** the reader submits while multiple descendant registrations are mounted
- **THEN** the parent reports their aggregate issues
- **WHEN** an optional descendant is unmounted
- **THEN** its committed issues leave the parent scope without another validation run

### Requirement: Inline localisation example
The localisation guide SHALL provide a runnable example using the real Vue I18n adapter.

#### Scenario: Locale changes without revalidation
- **WHEN** the reader validates invalid data once and then changes locale
- **THEN** the committed error text changes to the selected locale
- **THEN** the displayed validation-run count remains unchanged

### Requirement: Source parity
Each inline example SHALL display source imported from the same Vue component that powers the runnable example.

#### Scenario: Reader opens example source
- **WHEN** the reader expands the source disclosure
- **THEN** the documentation displays the current implementation of that runnable component

### Requirement: Accessible and responsive example shell
Each inline example SHALL use labelled controls, visible focus, associated live errors, textual outcomes and a layout that does not create page-level horizontal overflow at 320 CSS pixels.

#### Scenario: Keyboard and narrow-screen use
- **WHEN** a reader operates an example with a keyboard or at 320 CSS pixels
- **THEN** every action and state remains available without colour-only meaning or page-level horizontal scrolling

### Requirement: Automated example verification
The documentation gate SHALL compile the examples, run their observable interaction tests and validate their authored source dependencies before producing the site.

#### Scenario: Example behaviour regresses
- **WHEN** validation, scope disposal, localisation reactivity, source imports or accessible form semantics regress
- **THEN** the documentation check fails before release

### Requirement: Honest Nuxt demonstration boundary
The Nuxt guide SHALL distinguish inline core examples from the repository's real Nuxt application playground.

#### Scenario: Reader wants to verify Nuxt integration
- **WHEN** the reader reaches the Nuxt guide
- **THEN** it provides the command and source location for running the full Nuxt playground rather than implying an embedded Vue component proves module integration
