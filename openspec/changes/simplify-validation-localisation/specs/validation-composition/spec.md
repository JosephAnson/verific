## Purpose

Define how Vue-owned model state is validated with Standard Schema registrations that compose automatically through the component tree.

## ADDED Requirements

### Requirement: One composable creates and joins validation scopes
The core package SHALL expose `useValidation()` as the public scope and registration API. A call SHALL join the nearest validation scope unless it explicitly requests a new scope; when no scope exists, the call SHALL create and provide one. Core validation SHALL work without installing `createVerific()`.

#### Scenario: Schema-owning root
- **WHEN** a component with no ancestor validation scope calls `useValidation(schema, model)`
- **THEN** it creates a scope, registers the schema and can validate without calling `createValidationScope()` or installing `createVerific()`

#### Scenario: Descendant registration
- **WHEN** descendants call `useValidation(schema, model)` beneath an existing scope
- **THEN** their registrations join the nearest scope and its `validate()` call validates every active registration

#### Scenario: Same-component registration
- **WHEN** one setup function creates a scope and later calls `useValidation(schema, model)` again
- **THEN** the later registration joins the scope created by the earlier call

#### Scenario: Orchestration-only root
- **WHEN** a component calls argumentless `useValidation()` and its descendants register schemas
- **THEN** the component can validate and inspect the descendant registrations without owning a schema itself

#### Scenario: Call outside component setup
- **WHEN** scope creation or schema registration is attempted without an active Vue component setup context
- **THEN** Verific throws an actionable error explaining where `useValidation()` must be called

### Requirement: Nested forms can create independent scopes
A call with `scope: 'new'` SHALL create and provide an independent validation scope even when an ancestor scope exists.

#### Scenario: Independent nested form
- **WHEN** a descendant calls `useValidation(schema, model, { scope: 'new' })`
- **THEN** that registration and its descendants are excluded from the ancestor scope's validation state and results

### Requirement: Controller views have consistent meanings
Every controller in a scope SHALL expose the same aggregate `issues`, `isValidating` and scope-wide `validate()` behaviour. A schema-bound controller SHALL additionally expose `ownIssues` and a reactive registration `result`; their meanings SHALL NOT depend on whether that call created or joined the scope.

#### Scenario: Aggregate and registration issues
- **WHEN** a root and two descendants have validation issues
- **THEN** every controller's `issues` contains all active scope issues in registration order while each schema-bound controller's `ownIssues` contains only its registration's issues

#### Scenario: Validation through a descendant
- **WHEN** a descendant controller calls `validate()`
- **THEN** every active registration in the shared scope is validated and the returned result reports aggregate success and issues

### Requirement: Verific does not own model state
`useValidation()` SHALL accept reactive objects, refs and supported records of refs as Standard Schema input without creating a competing form-state model. Each validation run SHALL synchronously snapshot refs, arrays and plain objects before invoking validators, and transformed output SHALL NOT be written back into the supplied model.

#### Scenario: Model remains application-owned
- **WHEN** application code mutates the supplied reactive model
- **THEN** the next validation uses that state without requiring a Verific setter or field registration API

#### Scenario: Pending nested mutation
- **WHEN** nested model data changes after an asynchronous validation run has taken its snapshot
- **THEN** that run validates the captured snapshot rather than a mixture of old and new model values

#### Scenario: Transformed schema output
- **WHEN** a schema transforms its input and validates successfully
- **THEN** the registration result exposes the typed transformed value and the original model remains unchanged

### Requirement: Validation issues retain provenance and canonical paths
Each exposed validation issue SHALL retain the original Standard Schema issue by identity, its vendor, original message, normalised local path and resolved scope path. Canonical paths SHALL be property-key arrays that preserve string, number and symbol segments and normalise Standard Schema `{ key }` segments.

#### Scenario: Child fragment path
- **WHEN** `useValidation(schema, model, { at: ['shipping'] })` returns an issue at `[{ key: 'postcode' }]`
- **THEN** the issue has local path `['postcode']` and resolved path `['shipping', 'postcode']`

#### Scenario: Pathless child issue
- **WHEN** a registration at `['shipping']` returns a pathless issue
- **THEN** the issue resolves to `['shipping']`

#### Scenario: Raw issue preservation
- **WHEN** a validator returns a rich or callable issue object
- **THEN** the exposed issue references that original object without mutation, spreading or serialisation

### Requirement: Field selectors use exact resolved paths
`issuesFor(path)` and `hasError(path)` SHALL select issues at exactly the requested path relative to the calling controller's registration prefix. They SHALL NOT include descendant paths. Aggregate summaries SHALL use `issues`.

#### Scenario: Exact field match
- **WHEN** issues exist at `['address']` and `['address', 'postcode']`
- **THEN** `issuesFor('address')` on the root returns only the issue at `['address']`

#### Scenario: Relative child selection
- **WHEN** a controller registered at `['shipping']` has an issue at `['shipping', 'postcode']`
- **THEN** its `issuesFor('postcode')` call returns that issue

#### Scenario: Duplicate issues
- **WHEN** multiple registrations produce identical issues at the same path
- **THEN** selectors retain every issue in registration order and validator issue order

### Requirement: Registration results preserve Standard Schema semantics
A schema-bound controller's result SHALL distinguish idle, valid and invalid states. A valid result SHALL contain that registration's typed Standard Schema output. An invalid result SHALL contain its issues and clear any previous output. A Standard Schema result SHALL be a failure exactly when `result.issues !== undefined`, including when that array is empty.

#### Scenario: Successful registration
- **WHEN** a registration returns a Standard Schema value
- **THEN** its result becomes valid with that value and its previous issues are cleared

#### Scenario: Failed registration after success
- **WHEN** a previously valid registration later returns issues
- **THEN** its result becomes invalid and its previous output is no longer exposed

#### Scenario: Empty failure issue list
- **WHEN** a Standard Schema validator returns a result containing `issues: []`
- **THEN** Verific treats the registration and aggregate run as unsuccessful

#### Scenario: Explicit undefined issues on success
- **WHEN** a Standard Schema validator returns `{ value, issues: undefined }`
- **THEN** Verific treats the registration as successful and preserves `value`

#### Scenario: Separate transformed outputs
- **WHEN** multiple registrations validate successfully
- **THEN** each controller retains only its own typed output and Verific does not attempt to merge their outputs

### Requirement: Scope validation is concurrent, atomic and latest-run authoritative
Each run SHALL validate its captured registrations concurrently and commit public issue and result state atomically. The newest overlapping run SHALL be authoritative; superseded callers SHALL adopt its outcome and stale work SHALL never overwrite newer state. `isValidating` SHALL describe the authoritative run.

#### Scenario: Overlapping validations
- **WHEN** an older validation remains pending and a newer validation settles first
- **THEN** both callers receive the newer outcome and the older work cannot change committed state

#### Scenario: Re-entrant validation during commit
- **WHEN** a synchronous reactive observer starts a new validation while an older run is committing
- **THEN** the older caller adopts the newer run and cannot return an actionable stale success

#### Scenario: Validator exception
- **WHEN** an active validator throws synchronously or rejects
- **THEN** `validate()` rejects with the original reason and the run does not partially replace the last committed scope state

#### Scenario: Empty scope
- **WHEN** an orchestration-only scope has no active registrations
- **THEN** validation succeeds with no issues

### Requirement: Registration lifetime follows Vue scope lifetime
A schema registration SHALL be removed when its Vue effect scope is disposed. Disposal SHALL immediately remove committed state, stop the registration from blocking an active validation and safely ignore later fulfilment or rejection.

#### Scenario: Descendant unmount
- **WHEN** a descendant with committed issues unmounts
- **THEN** its registration and issues are immediately removed from the aggregate scope

#### Scenario: Hanging validator disposal
- **WHEN** a descendant unmounts while its validator never settles
- **THEN** the current scope validation can settle without it and any later outcome is ignored

### Requirement: Legacy scope APIs are removed deliberately
The main entry point SHALL export `useValidation()` instead of `createValidationScope()` and `useValidate()`. Documentation SHALL provide migration examples rather than compatibility aliases with changed behaviour.

#### Scenario: Migrating an existing form
- **WHEN** a user follows the migration guide for a root `createValidationScope()` plus `useValidate(schema, model)` pair
- **THEN** the equivalent form uses one `useValidation(schema, model)` call with the same model and schema
