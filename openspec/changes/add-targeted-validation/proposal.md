## Why

Forms commonly validate a field when it loses focus. Verific currently exposes only full-scope `validate()`, so a blur either reveals every field's errors or forces applications to recreate path filtering, stale-result handling and issue merging themselves.

Standard Schema does not define field-only validation. Verific must keep validating complete registration inputs while selectively publishing the exact path requested by the application.

## What changes

- Add a typed `validateFor(path)` member to validation groups and controllers.
- Run complete matching Standard Schema registrations but replace only issues at the selected resolved path.
- Preserve unrelated committed issues and keep full `validate()` authoritative for transformed output.
- Coordinate async full and targeted runs so fast blur transitions do not lose independent field updates or allow stale work to overwrite newer state.
- Document and demonstrate `@blur="validateFor('field')"` with destructured controller members.

## What does not change

- Verific does not own DOM events, touched state or input state.
- Schemas remain the only validation rule source.
- Path selectors remain exact and controller-relative to `at`.
- Message resolution and locale adapters remain lazy and unchanged.

## Impact

The core interface gains one method. Internal committed state separates full registration results from the published issue ledger, and the run coordinator gains exact-path authority. Core tests, runnable docs examples and reference documentation change.
