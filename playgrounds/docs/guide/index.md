---
outline: deep
---

# Getting Started with Verific

Welcome to Verific, a model-based form validation library for Vue 3. This guide will help you set up Verific in your project and get started with creating validated forms using Zod.

## Installation

### For Vue 3 Projects

You can install Verific using your preferred package manager. Below are the commands for npm, yarn, pnpm, and bun.

::: code-group

```bash [pnpm]
pnpm add @verific/core
```

```bash [npm]
npm add @verific/core
```

```bash [yarn]
yarn add @verific/core
```

```bash [bun]
bun add @verific/core
```

:::

## Setting Up

## Creating a Form

Now that you have Verific set up, let's create a simple form to validate.

### Define a Zod Schema

First, define a Zod schema that represents the data structure you want to validate.

```typescript
import { z } from 'zod'

const userSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  age: z.number().min(18),
})
```

### Create a Form Component

Next, create a Vue component that uses Verific to validate the form.

```vue
<script setup>
import { createValidationScope, useError, useValidate } from '@verific/core'
import { ref } from 'vue'
import { userSchema } from './schemas' // Assuming the schema is in a separate file

const form = ref({
  name: '',
  email: '',
  age: null,
})

const { validate } = createValidationScope()
const { errors } = useValidate(userSchema, form)

function handleSubmit() {
  const result = validate()
  if (result.success) {
    // Handle successful form submission
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <input v-model="form.name" type="text" placeholder="Name">
    <span v-if="useError(errors.name, 'too_small')">Name must be at least 3 characters long.</span>

    <input v-model="form.email" type="email" placeholder="Email">
    <span v-if="useError(errors.email, 'invalid_type')">Please enter a valid email address.</span>

    <input v-model="form.age" type="number" placeholder="Age">
    <span v-if="useError(errors.age, 'too_small')">You must be at least 18 years old.</span>

    <button type="submit">
      Submit
    </button>
  </form>
</template>
```
