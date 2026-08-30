---
outline: deep
---

<script setup>
import FormStateExample from '../../.vitepress/examples/FormStateExample.vue'
</script>

# Form state

Verific observes application-owned values; it does not replace them. The state API reports whether the current model differs from a baseline, whether an interaction was recorded, and whether committed validation still describes the complete model snapshot.

```ts
const {
  errorsFor,
  resetState,
  result,
  state,
  stateFor,
  touch,
  validate,
  validateAt,
} = useValidation(schema, model)
```

`state` is a computed aggregate. `stateFor(path)` returns the exact-path snapshot and remains reactive when called in a template or caller-owned computed.

For registrations with an established dirty baseline, model changes, `touch()`
and `resetState()` are reflected by the selectors on the same JavaScript stack.
When `validate()` or `validateAt()` resolves, its publication is already
committed. Reading Verific state never requires `nextTick()`; waiting for Vue to
patch the DOM is a separate concern.

| Flag | Meaning |
| --- | --- |
| `dirty` | The current raw model differs structurally from its baseline. Reverting a value makes it clean again. |
| `touched` | Your application explicitly called `touch(path)`. Validation never fabricates interaction. |
| `validated` | An authoritative full or exact-path result covers this state. Only full validation validates the aggregate. |
| `stale` | The schema identity, registration set or complete raw input differs from the committed snapshot. |
| `validating` | Authoritative work that can affect this state is pending. Existing committed issues remain visible. |

## Try the state lifecycle

1. Edit **Profile name**, then restore `Ada`; the model returns from **Changed** to **Clean**.
2. Clear and leave **Profile name**. The blur handler calls `touch()` and `validateAt()` explicitly.
3. Change **Email address**. The name result becomes stale because a complete-schema rule may depend on that sibling.
4. Select **Use current values as baseline**. Current values stay unchanged while changed, touched, issues and validation history reset.
5. Select **Validate and transform**, then edit the email. Submission output disappears as soon as the full result becomes stale.
6. Enter `slow-taken@example.com` and select **Check email**. That special value takes 1.8 seconds, leaving enough time to enter `quick@example.com` and check again. **Checking** remains visible and only the newest exact run commits.
7. While the slow check is pending, **Use current values as baseline** remains available. It cancels the work without surfacing the expected `AbortError` as an application error.

<FormStateExample />

::: details View the source used by this example
<<< ../../.vitepress/examples/FormStateExample.vue
:::

## Dirty baselines and reset

Dirty state compares the current raw registration input with the baseline captured at registration or by `resetState()`. It handles nested plain objects, arrays, cycles, shared references and symbol keys using the same snapshot rules as validation. Missing properties differ from present properties whose value is `undefined`; non-plain objects such as `Date` and `File` compare by identity.

Computed refs, custom refs and objects with accessor properties are the setup-time safety exception: Verific does not evaluate them during registration. Their dirty baseline is deferred until the first successful state or validation capture, so edits made before that capture become the baseline rather than a dirty change.

`resetState()` first snapshots every active registration. If all captures succeed, it atomically:

- rebases dirty state to current values;
- clears committed issues, transformed results, touches and validation history;
- cancels pending full and targeted work with an `AbortError`;
- leaves the model unchanged.

Use it after loading server data or after a successful save. It is state rebasing, not a form-value reset.

## Touch and validate on blur

Interaction remains an application decision:

```ts
async function onEmailBlur() {
  touch('email')
  await validateAt('email')
}
```

Calling `validateAt()`, its deprecated [`validateFor()` alias](../reference/use-validation#deprecated-validatefor-alias) or `validate()` alone never marks a path touched. Controller paths are relative to their `at` prefix; orchestration-scope paths are absolute.

## Current results and submission output

An exact result becomes stale when any sibling in the same registration changes because Standard Schema does not expose cross-field dependencies. Reverting the complete input to the committed snapshot restores freshness without a schema run.

The example labels usable data **Current validated output**. It is visible only after a successful, current full validation:

```ts
const submission = computed(() => (
  result.value.status === 'valid'
  && state.value.validated
  && !state.value.stale
)
  ? result.value.value
  : undefined)
```

The typed output may differ from the raw model, but Verific never writes the transformation back into application state.
