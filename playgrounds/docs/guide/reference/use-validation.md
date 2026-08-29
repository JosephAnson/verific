# `useValidation`

`useValidation` creates or joins a validation **scope**. A scope validates its
active schema/model **registrations** together and exposes structured issues and
resolved error strings.

Call it during Vue component setup. No plugin is required unless you want
application-wide message resolution or issue normalisation.

Most forms begin with the same destructured interface:

```ts
const { errorsFor, hasError, validate, validateFor } = useValidation(schema, model)
```

Use `errorsFor()` and `hasError()` to render one field, `validateFor()` after a
field interaction and `validate()` before submission. See
[Binding form controls](../core/form-controls) for practical event and value
patterns.

For run results, transformed output, snapshots, disposal and overlapping async
runs, see [Validation lifecycle](./validation-lifecycle).

## Signatures

Create or join an orchestration-only scope:

```ts
function useValidation(options?: ValidationScopeOptions): ValidationGroup
```

Register a Standard Schema and model:

```ts
function useValidation<Schema extends StandardSchemaV1>(
  schema: MaybeRef<Schema>,
  model: ValidationData<Schema>,
  options?: ValidationOptions,
): ValidationController<Schema>
```

The model can be a reactive object, a ref containing the schema input, or an
object whose fields are individual refs:

```ts
const { errorsFor, hasError, validate, validateFor } = useValidation(schema, {
  email,
  password,
})
```

The first call in a component tree creates a scope. Later calls in that
component or its descendants join the nearest scope. Calling `validate()` on
any group or controller validates every active registration in that scope.

Use `{ scope: 'new' }` when a nested form must validate independently:

```ts
const { errorsFor, hasError, validate, validateFor } = useValidation(schema, model, {
  scope: 'new',
})
```

## Common members {#members-at-a-glance}

Every `ValidationGroup` and `ValidationController` exposes the four members used
by most forms:

| Member | Type | Meaning |
| --- | --- | --- |
| `errorsFor(path)` | `readonly string[]` | Resolved error strings at one exact path. |
| `hasError(path)` | `boolean` | Whether that exact path has at least one issue. |
| `validate()` | `Promise<ValidationResult>` | Validate every active registration in the scope. |
| `validateFor(path)` | `Promise<TargetValidationResult>` | Run complete matching schemas and publish fresh issues only at one exact path. |

`TargetValidationResult` contains only a readonly `issues` array. It has no
submission status or transformed output. `ValidationResult` is returned only by
full `validate()` and exposes the whole-scope `success` status.

## Advanced state and selectors

Use the remaining scope members when you need raw issues, aggregate state or a
single resolved error:

| Member | Type | Meaning |
| --- | --- | --- |
| `issues` | `ComputedRef<readonly ValidationIssue[]>` | All committed issues in the scope. |
| `errors` | `ComputedRef<readonly string[]>` | All committed issues resolved to display-ready strings. |
| `isValidating` | `ComputedRef<boolean>` | Whether any full, targeted or queued validation work is pending. |
| `issuesFor(path)` | `readonly ValidationIssue[]` | Structured issues at one exact path. |
| `errorFor(path)` | `string \| undefined` | The first resolved error at one exact path. |

Only the schema/model overload returns registration-local state and transformed
output:

| Member | Type | Meaning |
| --- | --- | --- |
| `ownIssues` | `ComputedRef<readonly ValidationIssue[]>` | Issues produced by this registration only. |
| `result` | `Readonly<ShallowRef<RegistrationResult<Output>>>` | This registration's idle, valid or invalid state, including typed output on success. |

Destructure `result` when you need registration-local state. The result unions
and output access pattern are documented under
[results and transformed output](./validation-lifecycle#results-and-transformed-output).

## Options

Both overloads accept scope options:

| Option | Type | Purpose |
| --- | --- | --- |
| `scope` | `'new'` | Create an independent scope instead of joining the nearest one. |
| `messages` | `MessageResolver` | Resolve error strings for this scope or registration. |
| `messagePrefix` | `string` | Supply a form-specific catalogue prefix to message resolvers. |
| `describeIssue` | `IssueNormaliser` | Convert vendor-specific issue data to a semantic identifier and values. |

An argumentless call that joins an existing scope cannot change its policy.
Configure `messages`, `messagePrefix` or `describeIssue` on the scope creator,
on a schema registration, or on a new independent scope.

Schema registrations also accept:

| Option | Type | Purpose |
| --- | --- | --- |
| `at` | `readonly PropertyKey[]` | Prefix issue paths without changing the value passed to the schema. |

```ts
const { errorsFor, hasError, validateFor } = useValidation(addressSchema, address, {
  at: ['shipping'],
})
```

An issue at the schema-local path `['postcode']` now has the scope path
`['shipping', 'postcode']`.

## Paths and selectors

Selectors match one exact path. Selecting a parent does not include descendant
issues:

```ts
issuesFor('address') // ['address'] only
issuesFor(['address', 'postcode']) // the nested field only
```

Use an array for nested paths; dotted strings are treated as one property key.

`validateFor(path)` uses the same path rules as the selectors. It captures the
complete model and runs each complete matching Standard Schema, so cross-field
rules still execute. It then publishes only issues whose resolved path exactly
matches the selected path:

```vue
<input
  v-model="email"
  :aria-invalid="hasError('email')"
  @blur="validateFor('email')"
>
```

Text-like controls usually call `validateFor()` on blur. Choices, pickers and
files should update the application model before calling it on change:

```ts
async function onCountryChange(value: string) {
  country.value = value
  await validateFor('country')
}
```

Each call returns the fresh issues for the selected exact path:

```ts
interface TargetValidationResult {
  readonly issues: readonly ValidationIssue[]
}

const { issues } = await validateFor('email')
```

An empty `issues` array describes only that path, not the complete form. The
targeted result deliberately has no `success` member. Targeted validation
updates issue selectors but does not update registration `result` or
transformed output; full `validate()` owns those submission states and is the
only submission gate.

For a repeated field, include the current array index in the exact path:

```ts
async function onContactEmailBlur(index: number) {
  await validateFor(['contacts', index, 'email'])
}
```

After a row is reordered or removed, its old index no longer identifies the
same value. Run full validation after changing the array so every published
issue describes the new structure:

```ts
async function removeContact(index: number) {
  contacts.value.splice(index, 1)
  await validate()
}
```

On a controller with `at`, selectors are relative to that prefix:

```ts
hasError('postcode')
errorsFor('postcode')
validateFor('postcode')
// Matches the scope path ['shipping', 'postcode'].
```

An orchestration-only group has no prefix, so its selectors use complete scope
paths. A pathless issue is selected with `[]`; on a prefixed controller, `[]`
selects the registration prefix itself.

## `ValidationIssue`

| Field | Meaning |
| --- | --- |
| `raw` | Original Standard Schema issue, retained by identity. |
| `vendor` | The schema's Standard Schema vendor. |
| `message` | Original schema message. |
| `localPath` | Path emitted by this registration's schema. |
| `path` | `at` plus `localPath`, used by the scope. |
| `semantic` | Optional locale-independent identifier, interpolation values and plural count. |

Errors are resolved lazily from issues. A locale change can therefore update
`errors`, `errorsFor()` and `errorFor()` without another validation run. A value
captured once in script is only a snapshot; retain it reactively when needed:

```ts
const emailErrors = computed(() => errorsFor('email'))
```

See [Message resolution](./messages) for resolver precedence and adapters.

Continue to [Validation lifecycle](./validation-lifecycle) before consuming
transformed output or coordinating async validation. For a complete descendant
composition example, see [Scopes and registrations](../core/nested-validation).
