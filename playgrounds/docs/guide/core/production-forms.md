# Server responses, submission and repeated rows

Verific keeps validation state alongside your model. The following APIs handle
common application workflows without choosing control props, events or markup.

## Server issues

Use `setIssues(path, issues)` to replace the server issues at one exact path:

```ts
const { setIssues, clearIssues, errorsFor, validate } = useValidation(schema, model)

setIssues('email', [{ message: 'This address is already registered' }])
setIssues([], [{ message: 'The request could not be completed' }])

clearIssues('email') // Clear server issues at this exact path.
clearIssues() // Clear every server issue in the scope.
```

Server issues appear in `issues`, `issuesFor()` and the error selectors. They
remain separate from schema issues: successful validation and `clearIssues()`
never erase each other's findings. A full `validate()` returns
`success: false` while any server issues remain.

The path is relative to the controller's `at` prefix. The supplied path takes
precedence over a raw issue's own path, while `issue.raw` retains the original
object. Server issues have `vendor: 'server'` and pass through the same
normalisation and message policy as that controller's schema issues. This lets
your own `describeIssue` map response codes into locale-independent identifiers.

Server issues belong to the scope and remain until you replace them, call
`clearIssues()`, reset state, edit array structure through an array helper, or
dispose the scope. Model edits do not silently clear them. Clear the relevant
issues when your application considers the response obsolete, commonly before a
new submission attempt. `ownIssues` and `result` remain schema-only.

## Submission state

`handleSubmit(callback)` creates an action that runs full validation and then
calls your callback only when the scope is valid and the validated inputs are
still current:

```ts
const {
  clearIssues,
  handleSubmit,
  isSubmitting,
  result,
  setIssues,
  submitCount,
} = useValidation(schema, model)

const submit = handleSubmit(async (_validation, signal) => {
  const parsed = result.value
  if (parsed.status !== 'valid')
    return

  const response = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.value),
    signal,
  })
  if (response.status === 422) {
    // Map your API's response format to the appropriate exact paths.
    setIssues('email', [{ message: 'This address is already registered' }])
  }
})

async function retry() {
  clearIssues()
  await submit()
}
```

Connect `submit` or `retry` to your application's submission event. Verific does
not prevent a DOM event or choose a button prop. Render `isSubmitting` and
`submitCount` through your UI's API.

- `isSubmitting` spans both full validation and the awaited callback.
- `submitCount` counts started attempts, including invalid attempts.
- Concurrent calls in one scope share the active promise and invoke only the
  first callback. A completed or rejected attempt permits another attempt.
- The callback receives the successful scope validation result and an
  `AbortSignal`. Read typed transformed output from each controller's `result`.
- Schema failures return `{ success: false, issues }`. Validator and callback
  exceptions reject. Inputs changing during async validation reject with
  `AbortError`, so an old snapshot cannot reach the callback.
- Reset and scope disposal cancel an active attempt, signal cancellation to the
  callback, clear the busy state and reset the count. Cancellation settles the
  returned promise even if a callback never settles. Pass the signal to
  cancellable application work such as `fetch`.

The returned `success` describes validation. Your callback owns HTTP failures
and application submission outcomes. All controllers and orchestration groups
in the same scope share submission state.

## Array helpers

Use `array(path, items)` with a writable ref to the array in your registered
model. A `toRef()` for a reactive model property also works:

```ts
const contacts = ref([{ email: 'ada@example.com' }, { email: 'grace@example.com' }])
const { array, commit, stateFor, validate } = useValidation(schema, { contacts })
const rows = array('contacts', contacts)

rows.insert(1, { email: '' })
rows.move(2, 0)
rows.remove(1)
```

Build interaction paths from the current row index:

```vue
<input v-model="contacts[index].email" @blur="commit(['contacts', index, 'email'])">
```

The helpers update the array you supplied and move touched state and per-row
dirty baselines with the retained rows. New rows start untouched and dirty;
removed rows lose their touched state. Aggregate dirty state still compares the
array structure with its original baseline, so reordering the array is a change.
`resetState()` makes the current structure the new baseline.

Nested array paths are supported. Metadata for a nested array follows a
containing row when that row moves. If you retain a nested helper across a
parent reorder, recreate it with the row's current path before using it.

Structural edits invalidate positional validation: they cancel pending
validation, queued commits and submissions, and clear the scope's schema
results and server issues. They preserve the submit count. Call `validate()`
again when you need issues for the new structure. The helper rejects invalid
indices, readonly refs and refs that do not correspond to the registered path.

Use these helpers with a schema that describes the array. They do not change
component keys or rewrite a child registration's `at` prefix. Direct array
mutations remain valid model edits, but they cannot remap prior touched state
or dirty baselines automatically.

## Validation outside a component

`createValidationScope()` creates an explicit scope that can live in a store,
service or plain composable:

```ts
import { createValidationScope } from '@verific/core'
import { ref } from 'vue'
import { z } from 'zod'

const email = ref('')
const scope = createValidationScope()
const validation = scope.register(z.object({ email: z.string().email() }), { email })

await validation.commit('email')
await scope.validate()

scope.dispose()
```

Registrations join this explicit scope and retain their own relative selectors,
commits and transformed results. Separate factory calls create independent
scopes. There is no implicit module-global scope; create one per store instance
or request.

If the factory runs inside an active Vue effect scope, stopping that owner also
disposes the validation scope. Otherwise call `dispose()` yourself. Disposal
stops observations, removes registrations, clears issues and cancels active
validation, commits and submissions. Retained controllers cannot start new
work after their scope is disposed. Disposing twice is safe.
