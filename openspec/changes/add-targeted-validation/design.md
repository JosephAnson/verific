## Interface decision

Expose targeted validation beside the existing selector family:

```ts
interface ValidationGroup<Path> {
  validate(): Promise<ValidationResult>
  validateFor(path: Path): Promise<ValidationResult>
}
```

```vue
<script setup lang="ts">
const {
  validate,
  validateFor,
  errorsFor,
  hasError,
} = useValidation(schema, model)
</script>

<template>
  <input
    v-model="model.email"
    :aria-invalid="hasError('email')"
    @blur="validateFor('email')"
  >
</template>
```

`validateFor` is event-agnostic. Applications may call it from blur, change, a wizard transition or their own scheduler. Core does not return DOM bindings or own touched state.

## Standard Schema semantics

Standard Schema exposes complete-schema validation only. `validateFor(path)` therefore snapshots the complete model and invokes the complete schema for every registration whose `at` prefix can contain the resolved path.

The operation then projects the resulting issues onto the exact requested path. It does not slice the model or inspect vendor-specific schema internals. Cross-field refinements still execute, but an issue assigned to another path is not published by this call.

Controller paths are relative to their `at` prefix. Orchestration-group paths are complete scope paths. Dotted strings remain one property key; nested paths use arrays; `[]` selects a pathless issue or a controller's registration prefix.

## Results and published issues

Committed state separates two facts:

```ts
interface CommittedState {
  readonly results: ReadonlyMap<symbol, RegistrationResult<unknown>>
  readonly issues: ReadonlyMap<symbol, readonly ValidationIssue[]>
}
```

- `results` is updated only by full `validate()` and remains the source of transformed output.
- `issues` is the published issue ledger used by `issues`, `ownIssues`, `errorsFor()` and related selectors.
- Full validation atomically replaces both maps.
- Targeted validation atomically replaces only exact-path issues in the ledger and does not change `results`.
- Unrelated retained issues preserve object identity and order.
- Replacement issues use registration order and schema issue order. They replace the first previous position for that path or append within that registration when the path was not previously present.

`validateFor()` resolves with a `ValidationResult` for the selected path only. `success` means that exact path has no fresh issues; it does not mean the whole scope is valid and must not authorise submission.

## Registration selection

A registration participates when its resolved namespace can contain the selected path:

- a registration at `[]` can participate for any path;
- one at `['shipping']` participates for `['shipping', 'postcode']`;
- a registration whose prefix is unrelated does not run.

Several registrations may contribute issues at the same path. Disposal removes a registration's result and issue ledger entry immediately and prevents pending work from committing.

## Async authority

Full validation remains exclusive submission authority.

- Starting full `validate()` supersedes all pending targeted runs and commits the complete scope atomically.
- A superseded targeted caller adopts the full run projected to its requested path.
- A targeted call requested while a full run is active waits for that full run to settle, then captures fresh input and starts.
- Newer full runs retain the existing newest-full-run behaviour.

Targeted runs use exact-path authority.

- A newer run for the same resolved path supersedes the older run; the older caller adopts the newer result.
- Runs for disjoint paths may settle and commit independently.
- A targeted commit is atomic across every participating registration.
- `isValidating` is true while any full or targeted work, including a targeted call waiting behind full validation, is pending.

Operational failures reject and preserve previous committed state. Cancellation keeps handlers on abandoned validator promises so late rejection cannot become unhandled.

## Alternatives rejected

### `validate(path)` overload

It minimises member count but makes one method mean either complete result publication or targeted issue publication. A named method makes the state distinction visible.

### `select(path).validate()`

Persistent field controllers provide flexibility but enlarge the interface and encourage named controller objects for the common template case. Existing selectors plus one action provide better leverage.

### DOM field bindings or trigger options

They couple the core seam to Vue event and accessibility policy, while applications still need control over IDs, live regions and touched state.

### Vendor-specific field schema extraction

It would create a second rule system, break cross-field refinements and abandon Standard Schema portability.
