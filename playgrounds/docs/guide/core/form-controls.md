---
outline: deep
---

<script setup>
import FormControlsExample from '../../.vitepress/examples/FormControlsExample.vue'
</script>

# Binding form controls

Verific validates application-owned values. The application connects its controls
to validation through `commit(path)` and renders errors with the existing
selectors. For a native email input, that can be an inline blur handler:

```ts
const { commit, errorsFor, hasError } = useValidation(schema, { email })
```

```vue
<input
  v-model="email"
  type="email"
  :aria-invalid="hasError('email')"
  aria-describedby="email-errors"
  @blur="commit('email')"
>

<ul id="email-errors" aria-live="polite">
  <li v-for="(error, index) in errorsFor('email')" :key="index">{{ error }}</li>
</ul>
```

A commit reads the current model, touches the path and runs targeted validation.
Repeated calls share equivalent pending work or reuse a fresh result. The
comparison includes the complete matching schema inputs, so changing a sibling
field still causes the next commit to validate cross-field rules again.

- Call `commit(path)` after the control has updated its model. Choose events and
  props using that control's API; component libraries can expose different names,
  payloads and accessibility mechanisms.
- Use `validate()` for submission. Its full result is the only authority for continuing to the next application step.
- For native controls, blur suits text-like values and change suits choices,
  pickers and files. These are application choices, not triggers installed by Verific.

Touch is interaction metadata; it does not itself show or hide errors. Calling `validate()` programmatically does not mark a path touched. Use `stateFor(path).touched` only when the application deliberately wants interaction-aware presentation. See [Form state](./form-state) for the complete state lifecycle.

**Targeted validation runs the complete matching schemas**, including async
refinements, before selecting one path's issues. Use
`commit(path, { debounce: 200 })` to reduce repeated runs when appropriate. A
controller-wide `{ debounce: 200 }` option supplies the default delay for explicit
commits; `validate()` and `validate()` remain immediate.

## Try three distinct value shapes {#form-control-demo}

This form covers the patterns that differ most in everyday use:

1. Leave **Age** empty, then move focus away. Its `number | ''` model is validated on blur while the other controls remain quiet.
2. Choose a **Country**. The change handler assigns the scalar value before validating its path.
3. Select and clear an **Interest**. The handler changes membership in a string array before validating the group path.
4. Select **Validate preferences**. Full validation publishes every current issue and moves focus to the first invalid control.

<FormControlsExample />

::: details View the source used by this example
<<< ../../.vitepress/examples/FormControlsExample.vue
:::

The error containers remain mounted even when empty, so every `aria-describedby` reference stays valid. Native `required` exposes scalar requirements, while the checkbox group uses a visible, persistently described at-least-one instruction because HTML cannot express that constraint without falsely requiring an individual checkbox. The choices share a `fieldset`, `legend` and group error. The form uses `novalidate` so native browser messages do not compete with the schema messages.

## Choose an event for your control

Most form controls reduce to a small set of model shapes and events:

| Control family | Typical model | Suggested application event |
| --- | --- | --- |
| Text, search, email, password, URL, telephone and `textarea` | `string` | Blur |
| Number | `number \| ''` | Blur |
| Range | `number` | Change; use input only when continuous validation is intentional |
| Radio group or scalar `select` | String, number or enum value | Change |
| Multiple `select` or checkbox group | Array of selected values | Change |
| Single checkbox | `boolean` | Change |
| Date, time, week and month | Usually the native string value | Change |
| File input | `File \| undefined` or `File[]` | Change |
| Repeated rows | Array plus an exact path containing the current index | Blur or change for the nested control |
| Custom control | The value emitted by that control | Its committed-value event |

### Text, number and range

Text-like fields usually validate on blur so validation does not interrupt typing. Keep an explicit blank state for numeric fields; `v-model.number` leaves an empty number input as `''` rather than inventing zero.

```vue
<input v-model="email" type="email" :aria-invalid="hasError('email')" aria-describedby="email-errors" @blur="commit('email')">

<input v-model.number="age" type="number" :aria-invalid="hasError('age')" aria-describedby="age-errors" @blur="commit('age')">

<input v-model.number="volume" type="range" :aria-invalid="hasError('volume')" aria-describedby="volume-errors" @change="commit('volume')">
```

If an application deliberately validates while a range thumb moves, use
`@input="commit('volume', { debounce: 200 })"`. For submit-only validation, omit
the interaction handler and call `validate()` on submission.

### Radio and multiple selection

Radio buttons behave like one scalar choice. A multiple select behaves like a checkbox group and supplies an array:

```vue
<fieldset :aria-invalid="hasError('delivery')" aria-describedby="delivery-errors" @change="commit('delivery')">
  <legend>Delivery</legend>
  <label>
    <input v-model="delivery" type="radio" value="standard" :aria-invalid="hasError('delivery')" aria-describedby="delivery-errors">
    Standard
  </label>
  <label>
    <input v-model="delivery" type="radio" value="express" :aria-invalid="hasError('delivery')" aria-describedby="delivery-errors">
    Express
  </label>
</fieldset>

<select v-model="topics" multiple :aria-invalid="hasError('topics')" aria-describedby="topics-errors" @change="commit('topics')">
  <option value="design">Design</option>
  <option value="testing">Testing</option>
</select>
```

For these native controls, Vue updates the `v-model` value before the change
handler commits its path. A bubbling change handler on the fieldset validates
the shared array or scalar path. Use a `fieldset` and `legend` for a related
radio or checkbox group and point every member at the same persistent error
container. Custom components may need their own explicit event mapping.

### Date and time

Native temporal controls expose strings such as `2026-08-29` or `14:30`. Keep that string in the form model and let the schema transform it, or convert it in the change handler before validation:

```vue
<input v-model="appointmentDate" type="date" @change="commit('appointmentDate')">

<input v-model="appointmentTime" type="time" @change="commit('appointmentTime')">
```

Choose one representation deliberately; do not mix native strings and `Date` objects in the same field.

### Files

File inputs cannot use `v-model`. Read the current selection, update the model, then validate:

```ts
const attachments = ref<File[]>([])

async function onFilesChange(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  attachments.value = Array.from(input.files ?? [])
  await commit('attachments')
}
```

```vue
<input type="file" multiple @change="onFilesChange">
```

### Repeated rows

Build the path from the current array index when the interaction occurs:

```vue
<input
  v-model="contacts[index].email"
  type="email"
  @blur="commit(['contacts', index, 'email'])"
>
```

Use [array helpers](./production-forms#array-helpers) when inserting, moving or
removing rows so touched state and dirty baselines follow those rows. After a
structural edit, run full `validate()` when you need issues for the new array.
Paths are positional; use your application's own stable component keys.

### Custom controls

At a custom-control seam, assign the emitted value before committing its path:

```ts
async function onRatingChange(value: number) {
  rating.value = value
  await commit('rating')
}
```

```vue
<RatingPicker :model-value="rating" @update:model-value="onRatingChange" />
```

This example assumes an application-owned `RatingPicker` that accepts
`model-value` and emits `update:model-value`. Use the actual prop and event names
of your component. Likewise, map `hasError('rating')` and `errorsFor('rating')`
to its error props or slots and follow its accessibility API. There is no
universal prop object: Verific only sees the model and the explicit commit.

Continue with [Advanced schemas](./advanced-schemas) for runnable nested, repeated, custom and discriminated-union patterns.
