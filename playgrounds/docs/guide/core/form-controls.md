---
outline: deep
---

<script setup>
import FormControlsExample from '../../.vitepress/examples/FormControlsExample.vue'
</script>

# Binding form controls

Verific validates application-owned values; it never owns or returns a control's value. `on(path)` binds validation and accessibility state to a native control while leaving `v-model` in charge of the model:

```ts
const { on } = useValidation(schema, { email })
const emailBinding = on('email', { describedBy: 'email-errors' })
```

```vue
<input v-model="email" type="email" v-bind="emailBinding">

<ul id="email-errors">
  <!-- render errors here -->
</ul>
```

The default binding includes both blur and change handlers. They share one commit and deduplicate the current model value, so text inputs, selects and radios can use the same binding even when a browser fires both events. A commit touches the path before targeted validation. Set form-wide defaults with `useValidation(schema, model, { validateOn: 'input', debounce: 200 })`; a binding's `trigger` and `debounce` options override them.

- Use `commit(path)` for custom controls after assigning their emitted value. It performs the same touch, deduplication and targeted validation as a binding.
- Use `validate()` for submission. Its full result is the only authority for continuing to the next application step.
- Prefer blur for text-like values and change for choices, pickers and files. Always update the model before touching and validating its path.

Touch is interaction metadata; it does not itself show or hide errors. Calling `validateAt()` programmatically does not mark a path touched. Use `stateFor(path).touched` only when the application deliberately wants interaction-aware presentation. See [Form state](./form-state) for the complete state lifecycle.

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

## Choose by behaviour, not element name

Most form controls reduce to a small set of model shapes and events:

| Control family | Typical model | Targeted trigger |
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

```ts
const emailBinding = on('email', { describedBy: 'email-errors' })
const ageBinding = on('age', { describedBy: 'age-errors' })
const volumeBinding = on('volume', { describedBy: 'volume-errors' })
```

```vue
<input v-model="email" type="email" v-bind="emailBinding">

<input v-model.number="age" type="number" v-bind="ageBinding">

<input v-model.number="volume" type="range" v-bind="volumeBinding">
```

If an application deliberately validates while a range thumb moves, use `on('volume', { trigger: 'input', debounce: 200 })`. Use `{ trigger: 'submit' }` to return accessibility bindings without event-driven validation.

### Radio and multiple selection

Radio buttons behave like one scalar choice. A multiple select behaves like a checkbox group and supplies an array:

```ts
const deliveryBinding = group('delivery', { describedBy: 'delivery-errors' })
const topicsBinding = on('topics', { describedBy: 'topics-errors' })
```

```vue
<fieldset v-bind="deliveryBinding">
  <input v-model="delivery" type="radio" value="standard">
  <input v-model="delivery" type="radio" value="express">
</fieldset>

<select v-model="topics" multiple v-bind="topicsBinding">
  <option value="design">Design</option>
  <option value="testing">Testing</option>
</select>
```

Vue updates each `v-model` value before the named change handler touches and validates its path. Use a `fieldset` and `legend` for a related radio or checkbox group. Point every member at the same persistent error container.

### Date and time

Native temporal controls expose strings such as `2026-08-29` or `14:30`. Keep that string in the form model and let the schema transform it, or convert it in the change handler before validation:

```ts
async function onAppointmentDateChange() {
  touch('appointmentDate')
  await validateAt('appointmentDate')
}

async function onAppointmentTimeChange() {
  touch('appointmentTime')
  await validateAt('appointmentTime')
}
```

```vue
<input v-model="appointmentDate" type="date" @change="onAppointmentDateChange">

<input v-model="appointmentTime" type="time" @change="onAppointmentTimeChange">
```

Choose one representation deliberately; do not mix native strings and `Date` objects in the same field.

### Files

File inputs cannot use `v-model`. Read the current selection, update the model, then validate:

```ts
const attachments = ref<File[]>([])

async function onFilesChange(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  attachments.value = Array.from(input.files ?? [])
  touch('attachments')
  await validateAt('attachments')
}
```

```vue
<input type="file" multiple @change="onFilesChange">
```

### Repeated rows

Build the path from the current array index when the interaction occurs:

```ts
async function onContactEmailBlur(index: number) {
  const path = ['contacts', index, 'email'] as const
  touch(path)
  await validateAt(path)
}
```

```vue
<input
  v-model="contacts[index].email"
  type="email"
  @blur="onContactEmailBlur(index)"
>
```

After reordering or removing rows, indices no longer describe the same entries. Run full `validate()` so published issues reflect the new structure before treating them as current. Touched paths are positional too: Verific cannot remap an earlier index to a logical row, so do not use it as stable row identity.

### Custom controls

At a custom-control seam, assign the emitted value before targeted validation rather than asking Verific to understand the control:

```ts
async function onRatingChange(value: number) {
  rating.value = value
  await commit('rating')
}
```

```vue
<RatingPicker :model-value="rating" @update:model-value="onRatingChange" />
```

This preserves a small validation interface while the application retains ownership of event timing, accessible markup and value conversion.

Continue with [Advanced schemas](./advanced-schemas) for runnable nested, repeated, custom and discriminated-union patterns.
