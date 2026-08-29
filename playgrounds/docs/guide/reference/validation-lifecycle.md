# Validation lifecycle

This page describes how a `useValidation` scope captures input, runs schemas,
commits state and handles disposal or overlapping runs. For signatures, options,
members and path selectors, use the [`useValidation` reference](./use-validation).

## One validation run

Calling `validate()` starts one run for every active registration in the scope:

1. Verific synchronously captures each registration's current schema and model.
2. It validates all captured registrations concurrently.
3. It waits for the active registrations to settle.
4. It commits all registration results together and resolves the aggregate
   `ValidationResult`.

The commit is atomic. While a run is pending, readers continue to see the
previous committed issues and registration results unless a registration is
disposed; one fast schema cannot partially replace them. An empty scope
validates successfully.

Always await `validate()`:

```ts
const { validate } = useValidation(schema, model)
const outcome = await validate()

if (outcome.success) {
  // Continue with submission.
}
```

## Targeted validation

Call `validateFor(path)` when an interaction such as blur should update one
field without revealing errors for untouched fields:

```ts
const { errorsFor, hasError, validate, validateFor } = useValidation(schema, model)
const { issues } = await validateFor('email')
```

This is targeted publication, not schema slicing. Verific captures the complete
model and executes the complete matching Standard Schema registrations, so
cross-field refinements receive all input. Only fresh issues at the selected
exact path replace committed issue state; unrelated committed issues remain.

The public targeted result is deliberately issues-only:

```ts
interface TargetValidationResult {
  readonly issues: readonly ValidationIssue[]
}
```

It contains fresh issues only for the selected path. An empty array does not
approve the complete scope: await full `validate()` and inspect its `success`
status before submission. `validateFor()` never updates a registration's
`result` or transformed output. Those remain `idle` until full `validate()` runs
and remain owned by the latest full validation afterwards.

## Results and transformed output

Full `validate()` resolves with the aggregate scope status:

```ts
type ValidationResult
  = | { readonly success: true, readonly issues: readonly ValidationIssue[] }
    | { readonly success: false, readonly issues: readonly ValidationIssue[] }
```

Each schema registration also exposes its own state through `result`:

```ts
type RegistrationResult<Output>
  = | { readonly status: 'idle' }
    | { readonly status: 'valid', readonly value: Output }
    | { readonly status: 'invalid', readonly issues: readonly ValidationIssue[] }
```

`result` starts as `idle`. An authoritative completed full `validate()` run commits its `valid` or
`invalid` state; disposing the registration removes that committed state, so
the controller reads `idle` again. The `valid` value is the Standard Schema's
typed output:

```ts
const { result, validate } = useValidation(schema, model)
const outcome = await validate()

if (outcome.success && result.value.status === 'valid') {
  const output = result.value.value
}
```

Verific stores the output in `result`; it does not write it back into the
original model. In a scope with more than one registration, `outcome.success`
describes the whole scope; read each controller's `result` for its
registration-specific output.

## Input snapshots

Verific reads the model when `validate()` starts. It unwraps refs and recursively
copies arrays and plain objects before any schema validation can complete. Later
model edits therefore belong to a later run:

```ts
const { validate } = useValidation(schema, model)
const pending = validate()
model.profile.name = 'After capture'
await pending
```

The pending run validates the value captured at its start. Non-plain objects are
passed through rather than cloned.

## Overlapping runs

The newest call to `validate()` is authoritative. Starting another run
supersedes any older one and updates `isValidating` to describe the newest run.

Older callers adopt the newest run's eventual result or failure. A late
fulfilment or rejection from a superseded validator is ignored and cannot
overwrite committed state. This also applies when a newer run starts while the
older run is capturing input or committing results.

Targeted runs for different paths may complete independently, so rapidly
leaving email and password can publish both results in either completion order.
A newer targeted run for the same path is authoritative and an older caller
adopts its result. Full `validate()` supersedes pending targeted work; a
targeted request made while full validation is active waits and then captures
fresh input. `isValidating` remains true while full, targeted or queued work is
pending.

## Registration disposal

A registration remains active while its Vue effect scope is active. When that
scope is disposed, Verific immediately:

- removes the registration from future validation;
- removes its committed result and issues from the scope; and
- ignores its outstanding validator, whether it later fulfils or rejects.

A run does not wait for a disposed registration, so removing a component whose
validator is still pending can allow the remaining run to complete.

Creating `{ scope: 'new' }` also starts a separate lifecycle. The new scope does
not inherit message, message-prefix or issue-normalisation policy from an outer
scope, although application-wide `createVerific` policy remains available.

## Failures

Ordinary invalid data resolves rather than rejects: full `validate()` reports
`success: false`, while `validateFor()` returns the selected issues. Operational
failures reject either promise. Rejections include:

- a schema validator throwing or returning a rejected promise;
- an error while capturing the model;
- a reactive schema no longer being Standard Schema compliant; and
- an issue normaliser throwing.

When the authoritative run rejects, its partial work is not committed. Previous
committed issues and registration results remain available. `isValidating`
returns to `false` once no other full, targeted or queued work remains.

```ts
const { validate } = useValidation(schema, model)

try {
  const outcome = await validate()

  if (outcome.success) {
    // Submit.
  }
}
catch (error) {
  // Report an unexpected validation failure.
}
```

Message resolvers are different: they run lazily when code reads `errors`,
`errorsFor()` or `errorFor()`. A resolver exception therefore surfaces from
that read, not from the preceding `validate()` call.

Calling `useValidation` outside component setup throws immediately. A
non-compliant non-reactive schema also throws when its registration is created.

Return to the [`useValidation` common members](./use-validation#members-at-a-glance)
or continue with [Message resolution](./messages).
