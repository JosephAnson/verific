## Why

Verific's public validation interface is cohesive, but its busiest internal files now concentrate unrelated lifecycle, observation, issue-resolution and documentation-audit concerns. Deepening those internal modules will improve locality and leverage while reducing the regression risk of future validation and adapter work.

## What Changes

- Keep `useValidation` as a thin Vue adapter and concentrate Scope and Registration lifecycle orchestration in a deep internal module.
- Concentrate snapshot capture, structural comparison, baselines, validation stamps and reactive observation in a Registration observation module.
- Concentrate Issue construction, semantic normalisation, message-policy ownership and lazy Error resolution in an Issue-to-Error pipeline while preserving the existing Locale adapter seam.
- Split rendered-validation AST expansion and form-contract auditing from documentation discovery and reporting, and keep inferable checker intent out of rendered examples.
- Add a shared conformance-test module for the common Locale adapter contract while retaining vendor-specific lifecycle tests locally.
- Prove that current validation state and lazily resolved Errors can be read immediately after reactive input or locale changes; consumers must not need `await nextTick()` except when they are explicitly waiting for Vue DOM or lifecycle work.
- Preserve all public exports, runtime behaviour, validation semantics and documentation guarantees.

## Capabilities

### New Capabilities

None. This change deepens internal modules and test infrastructure without adding product behaviour.

### Modified Capabilities

None. Existing behavioural requirements remain unchanged.

## Impact

The work affects internal core validation implementation, message resolution internals, documentation audit tooling and Locale adapter tests. It introduces no breaking changes, new runtime dependencies or public interface changes.
