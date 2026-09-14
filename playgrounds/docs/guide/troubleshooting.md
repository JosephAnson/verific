---
outline: deep
---

# Troubleshooting

Start with the symptom, then follow the linked reference for the complete contract. These checks use the current `useValidation` interface.

## Errors or state stop updating after I store a selector result

`errorsFor()`, `errorFor()` and `stateFor()` return snapshots when called once in ordinary script. Call them in the template or retain them inside a Vue computed:

```ts
const { errorsFor, stateFor } = useValidation(schema, model)
const emailErrors = computed(() => errorsFor('email'))
const emailState = computed(() => stateFor('email'))
```

The same rule applies when the locale changes: a string captured earlier is still the earlier string. Use the reactive `errors` ref or a computed selector. See [Reactive state and selectors](./reference/use-validation#advanced-state-and-selectors).

If a parent can replace the entire model, pass a ref/computed ref rather than a one-time property value. A getter function by itself is not a supported model source. See [Options](./reference/use-validation#options).

## A nested error exists but my selector returns nothing

Selectors match one exact path. `errorsFor('address')` does not include `['address', 'postcode']`, and `'address.postcode'` is a literal property key rather than a nested path. Use `errorsFor(['address', 'postcode'])`.

For a registration with `at: ['shipping']`, local `errorsFor('postcode')` resolves to `['shipping', 'postcode']`; an orchestration-only scope uses that complete path. Use `[]` for a registration-root issue. See [Paths and selectors](./reference/use-validation#paths-and-selectors).

## A valid result becomes stale when a different value changes

Verific executes complete Standard Schemas. A sibling value may affect a cross-field rule, so freshness covers the complete matching registration input, schema identity and registration set. A targeted result can therefore become stale after a sibling edit.

Call full `validate()` before submission and check its success plus current state. Run full validation after switching a discriminated-union branch, removing an array row or reordering an array. Array paths and touch records are positional; they do not follow a logical row automatically. See [Validation freshness](./reference/validation-lifecycle#validation-state-and-freshness) and [Advanced schemas](./core/advanced-schemas).

## Dirty state does not match my expectation

`dirty` compares raw values with their baseline, not with transformed output or the server. Reverting values restores clean state. Non-plain objects such as `Date` and `File` compare by identity, so mutating a `Date` in place is not a structural change to that identity.

Computed refs, custom refs and objects with accessors defer their initial baseline until their first successful state or validation capture. Edits made before that capture become the baseline. Read [Dirty baselines and reset](./core/form-state#dirty-baselines-and-reset) before changing how the model is supplied.

## Reset does not clear my inputs, or a save makes newer edits clean

`resetState()` rebases current values and clears issues, results and interaction history. It deliberately does not change the application-owned model. To restore form values, update that model yourself and then rebase if those restored values should be the new baseline.

Do not reset unconditionally when a request succeeds: newer edits may not have been sent. Compare current raw values with the request's captured raw snapshot before rebasing. The [save workflow](./core/service-layer-to-validation#rebase-only-the-values-that-were-saved) shows the complete pattern.

## A child does not join my form, or validation runs another form too

Call `useValidation()` synchronously during setup. A child can join only a scope already created by an ancestor or earlier in the same setup; it cannot discover a sibling's scope or one created later. Calls otherwise create a scope themselves.

The nearest scope wins, and `validate()` on any registration in it validates the whole scope. Use `{ scope: 'new' }` for an independent nested form. Do not give that option to children that should join their parent's scope. A scope collects validation results, not child-owned form values; use the [parent-owned split-form recipe](./core/nested-validation#split-a-form-across-components) when the parent must submit the data.

See [Component-tree rules](./core/nested-validation#component-tree-rules) for disposal and scope policies.

## The save button enables too soon, or an async handler throws

`isValidating` covers schema work, not your subsequent network request. Keep your own `isSubmitting` guard true through both operations, use it inside the submit handler and disable the button while it is true.

Ordinary invalid input resolves (`success: false` for full validation). A throwing schema, rejected async refinement or model capture failure rejects the promise instead; handle that operational failure in the application. Network failures also belong to application state, rather than being injected into Verific as schema issues.

Resetting can reject pending work with `AbortError`, but a schema or request can use that same name. Ignore cancellation only when you can associate it with work your application deliberately cancelled. See [Failures](./reference/validation-lifecycle#failures) and [Submitting validated data](./core/service-layer-to-validation).

## My translated message is missing or stays in the old language

Inspect `issuesFor(path)` first: `issue.semantic` provides the identifier and values used by the resolver; `issue.raw` retains the original vendor finding. A custom rule may need `describeIssue` to provide its semantic identifier.

Check the message prefix, catalogue key and active locale, then use the adapter's `onMissing` diagnostic for the attempted locales and keys. Missing translations fall back according to the resolver chain; a displayed schema message does not mean validation failed to run.

Retain errors reactively if the language can change. Verific resolves messages when errors are read and does not need to rerun schemas for a locale change. See [Missing messages](./localisation#missing-messages), [Message resolution](./reference/messages) and [Custom adapters](./localisation/custom-adapters).
