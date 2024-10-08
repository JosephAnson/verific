# Using Service Layer with Verific Validation

This guide demonstrates how to combine a service layer for API calls with Verific validation in your Vue.js application. This approach separates concerns, making your code more maintainable and easier to test.

## Step 1: Define a Zod Schema

First, define a Zod schema that represents the data structure for your form. This schema will be used to validate form data on the client.

```typescript
import { z } from 'zod'

// Define a schema for a user registration form
export const userSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters long'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
})

export type UserSchema = z.infer<typeof userSchema>
```

## Step 2: Create a Service Layer

First, create a service layer to handle API calls. This separates the API logic from your components.

Create a file named `apiService.js` in your `services` directory:

```typescript
// src/services/apiService.js
import { UserSchema } from '../schemas/userSchema'

export async function registerUser(user: UserSchema) {
  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(user),
    })

    if (!response.ok) {
      throw new Error('Server error occurred')
    }

    return response.json()
  }
  catch (error) {
    console.error('Error submitting form:', error)
    throw error
  }
}
```

## Step 3: Use Verific for Validation

Next, use Verific to validate your form data before sending it to the API.

```vue
<script setup>
import { useValidate } from 'verific'
import { ref } from 'vue'
import { userSchema, UserSchema } from './schemas/userSchema'
import { registerUser } from './services/apiService'

const props = defineProps<UserSchema>()
const emit = defineEmits(['update:name', 'update:email', 'update:password'])
const { name, email, password } = useVModels(props, emit)

// Validate the form data using the schema and reactive prop
const { validate, errors } = useValidate(userSchema, { name, email, password })

async function handleSubmit() {
  const result = validate()
  if (!result.success) {
    console.log('Validation errors:', errors.value)
    return
  }

  const response = await registerUser(result.data)
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <input v-model="formData.username" placeholder="Username">
    <span v-if="errors.username">{{ errors.username._errors[0] }}</span>

    <input v-model="formData.email" placeholder="Email">
    <span v-if="errors.email">{{ errors.email._errors[0] }}</span>

    <input v-model="formData.password" type="password" placeholder="Password">
    <span v-if="errors.password">{{ errors.password._errors[0] }}</span>

    <button type="submit">
      Register
    </button>
  </form>
</template>
```

## Explanation

1. **Form Data**: First we create the schema of the data we want to submit to the endpoint.

2. **Service Layer**: We create a service layer to handle the API call and use the type from the schema as the parameter for the function.

3. **Verific Validation**: The `useValidate` composable from Verific is used to validate the form data against the `userSchema`.

3. **Form Submission**: In the `handleSubmit` function:
   - First, validate the form data using Verific.
   - If validation succeeds, call the `registerUser` function from the service layer.

4. **Error Handling**: Validation errors are displayed in the template, and API errors are logged to the console.

## Benefits

- **Reusability**: The schema can be reused across multiple components and services, used to validate data in the service layer and to the end user in the template.
- **Validation**: Verific ensures that only valid data is sent to the API.
- **Type Safety**: When used with TypeScript, you get full type safety across your validation schema, component, and API service.

By combining a service layer with Verific validation, you create a robust system for handling form submissions with proper validation and API integration.
