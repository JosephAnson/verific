---
outline: deep
---

# Issues and errors

Verific exposes the same validation failure in two forms:

- An **issue** is structured data for application logic, diagnostics and custom resolution.
- An **error** is a string ready for the application to render.

Do not parse an error string to make decisions. Inspect its issue instead.

## From schema issue to rendered error

<ol class="verific-flow" aria-label="How a schema issue becomes a rendered error">
  <li>
    <strong>The schema reports the failure.</strong>
    A Standard Schema validator owns the original issue data and fallback message.
  </li>
  <li>
    <strong>Verific preserves and describes it.</strong>
    A <code>ValidationIssue</code> retains the original issue, adds registration and scope paths, and may add locale-independent semantic meaning.
  </li>
  <li>
    <strong>Verific resolves a display string.</strong>
    When an error is requested, the message resolver uses the structured issue and falls back to the schema message when nothing handles it.
  </li>
  <li>
    <strong>The application chooses how to use it.</strong>
    Application logic reads the issue; the interface renders the error string and owns its accessible announcement and association with the field.
  </li>
</ol>

## Structured issues

Each issue preserves the original Standard Schema issue as `raw` and adds:

| Property | Meaning |
| --- | --- |
| `vendor` | The schema implementation that produced the issue. |
| `message` | The original schema prose used as the final fallback. |
| `localPath` | The path inside this registration's model. |
| `path` | The path after the registration's `at` prefix is applied. |
| `semantic` | An optional locale-independent identifier, interpolation values and count. |

Use `ownIssues` for only the current registration or `issues` for the whole scope:

```ts
const { issues, ownIssues, issuesFor, hasError } = useValidation(schema, model)

issues.value
ownIssues.value
issuesFor(['address', 'postcode'])
hasError('email')
```

Selectors match one exact resolved path. They do not include descendants, and dotted strings are not expanded.

## Ready-to-render errors

`errors` resolves every issue in the scope. Field selectors retain issue order and duplicates:

```ts
const { errors, errorsFor, errorFor } = useValidation(schema, model)

errors.value
errorsFor('email')
errorFor('email') // First error, or undefined.
```

Without a configured resolver, these strings are the original schema messages. With localisation configured, the strings are derived lazily from the stored issues, so changing locale does not rerun validation.

Selector calls are reactive when evaluated in a template or computed value. Calling one once in script stores only that returned array:

```ts
import { computed } from 'vue'

const emailErrors = computed(() => errorsFor('email'))
```

To see issues become associated field messages during a real submission, use the [interactive validation example](/guide/#basic-validation-demo). Its source shows the same `errorsFor()` calls that drive the rendered error lists.

## Validation outcome and transformed output

`await validate()` reports success for the entire scope and returns its aggregate issues. A schema registration also exposes `result`, which is one of:

- `idle` before a committed validation;
- `invalid` with that registration's issues; or
- `valid` with the schema's typed transformed output.

The output may differ from the model because schemas can trim, coerce or transform values.

## Choose your next task

- [Render errors with accessible field associations](/guide/components/error-messages).
- [Localise error strings](/guide/localisation) while keeping issues structured.
- [Submit validated, transformed data](/guide/core/service-layer-to-validation).
