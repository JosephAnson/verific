# Nested Components with Verific Validation

## Introduction

In Vue.js applications, nested components allow you to break down complex forms into smaller, manageable pieces. This approach enhances code readability and reusability. When combined with Verific validation, you can ensure that each nested component validates its data correctly before submission.

## Setting Up Nested Components

### Step 1: Create Nested Components

First, create your nested components. For example, let's create two components: `Form2NestedComponent1.vue` and `Form2NestedComponent2.vue`. Each component will handle a part of the form and its validation.

#### NestedComponent1.vue

```vue
<script setup lang="ts">
import { ErrorMessages, useError, useValidate } from '@verific/core'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { ref } from 'vue'
import { z } from 'zod'

const schema = z.object({
  firstName: z.string().min(1).max(8),
})

const firstName = ref('')

const { errors } = useValidate(schema, {
  firstName,
})
</script>

<template>
  <div class="container">
    <div class="flex-col flex">
      <label for="firstName">First Name</label>
      <InputText id="firstName" v-model="firstName" type="text" />
      <ErrorMessages
        :messages="{
          ['This field is required']: useError(errors.firstName, 'too_small'),
          ['Enter less than 8 characters']: useError(errors.firstName, 'too_big'),
        }"
        class="w-full text-sm block text-red-400"
      />
    </div>
  </div>
</template>
```

#### NestedComponent2.vue

```vue
<script setup lang="ts">
import { ErrorMessages, useError, useValidate } from '@verific/core'
import InputText from 'primevue/inputtext'
import { ref } from 'vue'
import { z } from 'zod'

const schema = z.object({
  lastName: z.string().min(5).max(10),
})

const lastName = ref('')

const { errors } = useValidate(schema, {
  lastName,
})
</script>

<template>
  <div class="container">
    <div class="flex-col flex">
      <label for="lastName">Last Name</label>
      <InputText id="lastName" v-model="lastName" type="text" />
      <ErrorMessages
        :messages="{
          ['Min length of 5 characters']: useError(errors.lastName, 'too_small'),
          ['Enter less than 10 characters']: useError(errors.lastName, 'too_big'),
        }"
        class="w-full text-sm block text-red-400"
      />
    </div>
  </div>
</template>
```

### Step 2: Integrate Nested Components in the Parent Component

Now, integrate these nested components into a parent component, such as `Form2.vue`. This parent component will handle the overall form submission and validation.

#### Form2.vue

```vue
<script setup lang="ts">
import { createValidationScope } from '@verific/core'
import { ref } from 'vue'
import Form2NestedComponent1 from '../components/Form2NestedComponent1.vue'
import Form2NestedComponent2 from '../components/Form2NestedComponent2.vue'

const { validate, errors } = createValidationScope()

async function onSubmit(event: Event) {
  event.preventDefault()
  const result = await validate()
  if (!result.success) {
    console.log('Validation errors:', errors.value)
    return
  }
  console.log({ title: 'Success', description: 'The form has been submitted.' })
}
</script>

<template>
  <div class="container">
    <h1 class="mb-4 font-bold text-lg">
      Nest form components with parent validation
    </h1>
    <form class="space-y-4" @submit="onSubmit">
      <NestedComponent1 />
      <NestedComponent2 />
      <button type="submit" :disabled="!errors">
        Submit
      </button>
    </form>
  </div>
</template>
```

## Explanation

1. **Nested Components**: Each nested component (`Form2NestedComponent1` and `Form2NestedComponent2`) is responsible for its own validation schema and state management. This encapsulation allows for better organization of form logic.

2. **Validation Scope**: The parent component uses `createValidationScope` from Verific to manage the overall validation state. This allows the parent to validate all nested components collectively.

3. **Form Submission**: When the form is submitted, the `onSubmit` function is called. It triggers the validation of all nested components. If any validation fails, the errors are logged, and the submission is halted.

4. **Error Handling**: Each nested component displays its validation errors using the `ErrorMessages` component, providing immediate feedback to the user.

## Benefits of Using Nested Components with Verific

- **Modularity**: Each component can be developed and tested independently.
- **Reusability**: Nested components can be reused across different forms.
- **Separation of Concerns**: Validation logic is separated from the UI logic, making the codebase cleaner and easier to maintain.

## Conclusion

Using nested components with Verific validation in Vue.js applications enhances the structure and maintainability of forms. By following the steps outlined above, you can create a robust form system that leverages the power of component-based architecture and model-based validation.
