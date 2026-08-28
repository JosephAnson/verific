## ADDED Requirements

### Requirement: Typed targeted validation

Every validation group and controller MUST expose `validateFor(path)`. Controller paths MUST use the same schema-derived type and `at`-relative resolution as `errorsFor(path)`; orchestration groups MUST accept complete scope paths.

#### Scenario: Vue blur usage

- **WHEN** a caller destructures `validateFor`, `errorsFor` and `hasError` from a schema controller
- **THEN** `@blur="validateFor('email')"` MUST validate and publish the email path without a wrapper controller object

#### Scenario: Invalid selector type

- **WHEN** TypeScript checks a schema controller call with a key outside the schema input
- **THEN** the `validateFor` call MUST fail type checking

#### Scenario: Registration prefix

- **WHEN** a registration at `['shipping']` calls `validateFor('postcode')`
- **THEN** it MUST target the resolved scope path `['shipping', 'postcode']`

### Requirement: Complete-schema execution with exact-path publication

Targeted validation MUST run complete matching Standard Schema registrations against complete captured inputs, while replacing published issues only at the exact selected resolved path.

#### Scenario: Cross-field rule executes

- **WHEN** `validateFor('confirmation')` runs a schema whose confirmation rule reads another model property
- **THEN** the rule MUST receive the complete model snapshot

#### Scenario: Exact path only

- **WHEN** a schema reports issues at the selected path, a descendant path and an unrelated path
- **THEN** only issues whose resolved path exactly equals the selection MUST replace published state

#### Scenario: Valid field clears its stale issues

- **WHEN** the selected path has committed issues and a later targeted run reports none at that path
- **THEN** those stale issues MUST be removed while unrelated committed issues remain unchanged

#### Scenario: Target result

- **WHEN** targeted validation completes
- **THEN** its `ValidationResult` MUST contain only fresh issues at the selected path and `success` MUST describe only that path

### Requirement: Full results remain submission-only state

Targeted validation MUST NOT update registration `result` or transformed output. Full `validate()` MUST continue to replace the complete issue ledger and registration results atomically.

#### Scenario: Targeted run leaves result idle

- **WHEN** `validateFor()` runs before any full validation
- **THEN** the registration result MUST remain `idle` while `ownIssues` and scope issues expose the targeted publication

#### Scenario: Full run after targeted runs

- **WHEN** full `validate()` completes after one or more targeted commits
- **THEN** it MUST replace all published issues and update every complete registration result from the same snapshot

### Requirement: Race-safe targeted updates

Targeted validation MUST preserve newest-run authority for the same path, allow disjoint paths to commit independently, and coordinate safely with full validation.

#### Scenario: Fast blur across fields

- **WHEN** pending targeted runs for email and password settle in either order
- **THEN** both exact-path updates MUST commit

#### Scenario: Same-path stale completion

- **WHEN** a newer targeted run for one path completes before an older run for that path
- **THEN** the older result MUST not overwrite the newer commit and its caller MUST adopt the newer targeted result

#### Scenario: Full validation supersedes targeted work

- **WHEN** full validation starts while targeted work is pending
- **THEN** the full run MUST become authoritative, the target caller MUST adopt its exact-path projection, and late target settlement MUST not overwrite full state

#### Scenario: Target waits behind full validation

- **WHEN** targeted validation is requested while full validation is active
- **THEN** it MUST begin with a fresh capture after the full run settles

#### Scenario: Validation activity

- **WHEN** any full, targeted or queued targeted run is pending
- **THEN** `isValidating` MUST be true until all active work has settled

### Requirement: Atomic failure and disposal

Operational failures MUST reject targeted validation without partially changing published issues. Disposed registrations MUST be removed immediately and MUST NOT block or later contribute to targeted commits.

#### Scenario: Matching validator rejects

- **WHEN** any active participating registration rejects
- **THEN** the targeted promise MUST reject with that reason and preserve the previous issue ledger

#### Scenario: Pending child disposal

- **WHEN** a participating descendant registration is disposed while its targeted validator never settles
- **THEN** the targeted call MUST settle from the remaining active registrations and the disposed registration MUST contribute no issue

### Requirement: Localised targeted issues

Targeted issues MUST retain their registration message policy and continue to resolve lazily.

#### Scenario: Locale changes after blur

- **WHEN** a targeted invalid issue is committed and the active locale changes
- **THEN** `errorsFor()` MUST update its text without another Standard Schema invocation

### Requirement: Documentation conventions

Public examples MUST destructure the `useValidation` members they use. The beginner form MUST demonstrate targeted validation on blur and full validation on submit without named controller objects.

#### Scenario: Beginner field blur

- **WHEN** the reader leaves an invalid email field
- **THEN** the runnable example MUST show the email error without revealing the untouched password error

#### Scenario: Full submit

- **WHEN** the reader submits the same example
- **THEN** the full form MUST validate and reveal every invalid field
