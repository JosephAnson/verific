---
outline: deep
---

<script setup>
import AdvancedSchemasExample from '../../.vitepress/examples/AdvancedSchemasExample.vue'
</script>

# Advanced schemas

Verific runs Standard Schema; the schema library continues to own nested rules, custom refinements, discriminated unions, asynchronous checks and transformations. Verific preserves the resulting paths and schedules complete-schema execution.

## Try structural validation

1. Clear **Display name** and **Date of birth**, make the passwords differ and select **Validate advanced form**. Nested, person-branch and explicit cross-field issues are published, and focus moves to the first invalid active control.
2. Change **Account kind** to Company. The handler records the interaction, runs full validation, removes the published date-of-birth issue and reports the required company number.
3. Change a contact email and leave the row. The handler explicitly touches and targets `['contacts', 0, 'email']`.
4. Select **Add blank contact**. The structural handler runs full validation and the new error appears at `['contacts', 1, 'email']`.
5. Remove contact 1. Full validation reruns and the remaining row is now selected by `['contacts', 0, 'email']`.

<AdvancedSchemasExample />

::: details View the source used by this example
<<< ../../.vitepress/examples/AdvancedSchemasExample.vue
:::

## Nested, indexed and root paths

Use tuple selectors for nested and numeric paths:

```ts
errorsFor(['profile', 'displayName'])
errorsFor(['contacts', index, 'email'])
touch(['contacts', index, 'email'])
validateAt(['contacts', index, 'email'])
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

Vendor issue payloads differ. A Zod custom issue exposes `code`, `params` and primitive path segments; a Valibot forwarded partial check exposes its own `type` and structured path items. Verific normalises both to the same path selector while preserving `issue.raw` and `issue.vendor`.

Use `describeIssue` when a custom rule needs a stable localisation identifier:

```ts
const describeIssue: IssueNormaliser = ({ raw }) => {
  const issue = raw as { params?: { rule?: string } }
  return issue.params?.rule
    ? { identifier: issue.params.rule, values: {} }
    : undefined
}
```

The executable core regressions cover real Zod and Valibot cross-field shapes.

## Discriminated unions

Branch-only keys are valid top-level selectors, but changing the discriminant changes the active schema structure. Run full validation after that change so inactive issues are removed and the active branch is authoritative:

```ts
async function changeKind(kind: 'person' | 'company') {
  model.value = createBranch(kind)
  await validate()
}
```

For asynchronous refinements, newest-run authority, pending state and transformed output, continue with [Form state](./form-state#current-results-and-submission-output).
