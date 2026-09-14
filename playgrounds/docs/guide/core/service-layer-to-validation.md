---
outline: deep
---

# Submitting validated data

Keep saving state in your application. Verific validates the model and exposes transformed output; your submit handler owns the request, duplicate-submit guard and request errors.

## Complete save workflow

These three files form a complete example. The service posts to an application-owned `/api/users` endpoint; implement that endpoint or replace the service with your existing client. The optional `save` prop lets a parent supply that client and lets the example tests control the request without mocking validation.

The schema trims both values and lowercases the email. Input and output types are derived separately even though both contain strings.

<<< ../examples/workflows/user.ts

The service resolves only after a successful response. A network failure or unsuccessful response rejects; neither is converted into a schema issue.

<<< ../examples/workflows/user-service.ts

The form keeps its inputs editable while saving. Its application-owned `isSubmitting` flag covers both validation and the request, including the interval before Vue disables the button.

<<< ../examples/workflows/RegistrationForm.vue

## Why the submission checks matter

`validate()` reports whole-scope success. The registration's `result` contains its typed transformed output. Check both, plus `state.validated` and `!state.stale`, before capturing the payload: asynchronous validation may have checked an earlier version of the model.

The payload is copied before the request starts. Editing the raw form while saving therefore cannot change that request's values. Verific never writes the trimmed name or lowercased email back into `form`.

This example has one isolated scope, a fixed schema and two raw string fields. Its shallow copies are complete snapshots for those shapes. For a nested model, copy the fields you send and compare every raw value covered by the intended baseline; copying just the outer object still shares nested references. The [split-form recipe](./nested-validation#split-a-form-across-components) shows an explicit nested copy.

## Rebase only the values that were saved

`resetState()` adopts the **current** model as the dirty baseline. Calling it unconditionally after a successful request could mark newer edits clean even though they were never sent.

The form captures raw fields alongside the transformed payload, then compares those raw fields when the request completes. If they still match, it rebases and reports success. If they differ, it preserves the existing baseline and newer edits, and reports that the earlier values were saved. A later submission can save and rebase the new values.

This is deliberately conservative: it does not try to rebase only part of the form. Dirty state still means a difference from the existing baseline, rather than a comparison with a server record. The example endpoint does not return replacement data; if your server normalises or replaces values, decide how to reconcile its response with current edits before rebasing.

## Pending requests and failures

`isValidating` describes schema work; it stops when validation settles. It does not cover your network request. Keep `isSubmitting` true until the entire operation finishes, and guard inside the handler as well as disabling the button.

On failure, the example leaves both values and their baseline unchanged, shows an application-owned error and enables retry. It also reports request `AbortError`s: an error with that name does not prove that Verific reset the validation state. Ignore cancellation only when your application can associate it with an operation it deliberately cancelled.

For reset behaviour and validation failures, see [Validation lifecycle](../reference/validation-lifecycle#failures). For a symptom checklist, see [Troubleshooting](../troubleshooting).
