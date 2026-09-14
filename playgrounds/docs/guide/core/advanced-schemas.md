---
outline: deep
---

<script setup>
import AdvancedSchemasExample from '../../.vitepress/examples/AdvancedSchemasExample.vue'
</script>

# Advanced schemas

Verific runs Standard Schema; the schema library continues to own nested rules, custom refinements, discriminated unions, asynchronous checks and transformations. Verific preserves the resulting paths and schedules complete-schema execution.

The following excerpts come from the schema used by the [live example](#try-structural-validation). They share `import { z } from 'zod'`; the complete schema source is available below the demo.

## Nested, indexed and root paths

Define nested objects and arrays in the schema as usual. These shared fields are included in both account branches:

<<< ../../.vitepress/examples/advanced-schema.ts#nested

Use tuple selectors for the resulting nested and numeric issue paths:

```ts
errorsFor(['profile', 'displayName'])
errorsFor(['contacts', index, 'email'])
validate(['contacts', index, 'email'])
```

An issue with no schema path belongs to the registration root. Select it with `[]`; when a controller is registered at `['shipping']`, that controller-relative root resolves to the absolute `['shipping']` path.

## Arrays are positional

An array path identifies its current index, not a logical row. After removal or reordering, Verific cannot infer which earlier touched or published index belongs to which application record.

Always run full `validate()` after an array structural edit:

```ts
async function removeContact(index: number) {
  contacts.splice(index, 1)
  await validate()
}
```

Do not imply that touched state follows a row across indexes. Keep stable record identity in your application model when the UI needs it, while validation paths remain positional.

## Custom and cross-field rules

Place cross-field rules in the schema and assign the issue to the control that can resolve it. The example uses Zod's explicit `path: ['confirmation']`, so `errorsFor('confirmation')` and first-invalid focus work without a Verific rule language.

Here `accountSchema` is the [discriminated union](#discriminated-unions) below. The refinement runs against its complete input:

<<< ../../.vitepress/examples/advanced-schema.ts#custom

Vendor issue payloads differ. A Zod custom issue exposes `code`, `params` and primitive path segments; a Valibot forwarded partial check exposes its own `type` and structured path items. Verific normalises both to the same path selector while preserving `issue.raw` and `issue.vendor`.

Use `describeIssue` when a custom rule needs a stable localisation identifier:

<<< ../../.vitepress/examples/advanced-schema.ts#describe-issue

The demo passes this function as `describeIssue: describeAdvancedIssue` when registering `advancedSchema`.

The executable core regressions cover real Zod and Valibot cross-field shapes.

## Discriminated unions

Choose a literal discriminant for each branch and include the shared fields. Only the selected account kind requires its branch-specific field:

<<< ../../.vitepress/examples/advanced-schema.ts#discriminated

Branch-only keys are valid top-level selectors, but changing the discriminant changes the active schema structure. After assigning the new branch model, run full `validate()` so inactive issues are removed and the active branch is authoritative. The complete `onKindChange` handler in the demo shows how the application preserves shared values while replacing branch-only fields.

## Try structural validation

1. Clear **Display name** and **Date of birth**, make the passwords differ and select **Validate advanced form**. Nested, person-branch and explicit cross-field issues are published, and focus moves to the first invalid active control.
2. Change **Account kind** to Company. The handler records the interaction, runs full validation, removes the published date-of-birth issue and reports the required company number.
3. Change a contact email and leave the row. The handler explicitly touches and targets `['contacts', 0, 'email']`.
4. Select **Add blank contact**. The structural handler runs full validation and the new error appears at `['contacts', 1, 'email']`.
5. Remove contact 1. Full validation reruns and the remaining row is now selected by `['contacts', 0, 'email']`.

This demo deliberately combines `touch()` with validation so its interaction labels can show touched state. That metadata is optional; it is not needed to run custom rules or discriminated unions.

<AdvancedSchemasExample />

::: details View the source used by this example
<<< ../../.vitepress/examples/AdvancedSchemasExample.vue
<<< ../../.vitepress/examples/advanced-schema.ts
:::

For asynchronous refinements, newest-run authority, pending state and transformed output, continue with [Form state](./form-state#current-results-and-submission-output).
