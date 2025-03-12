<p align="center">
  <a href="https://verific.josephanson.com" target="_blank">
    <img src="https://verific.josephanson.com/logo.png" width="200" title="Go to website">
  </a>
</p>

<p align="center">
Painless Vue forms
</p>

<p align="center">

<a target="_blank" href="https://www.npmjs.com/package/verific">
  <img src="https://img.shields.io/npm/v/verific.svg?label=&color=05bda8">
</a>

<a target="_blank" href="https://npm-stat.com/charts.html?package=verific">
  <img src="https://img.shields.io/npm/dm/verific.svg?color=05bd6d&label=">
</a>

<a href="https://verific.josephanson.com/" target="_blank">
  <img src="https://img.shields.io/badge/-docs%20and%20demos-009f53">
</a>

</p>

<br>

## Features

- 🧩 Model-based validation
- 🔗 Seamless integration with Vue 3
- ⚙️ Customizable validation rules
- ❌ Error handling
- 🛠️ Service layer integration

## Getting Started

### Installation

#### For Vue 3 Projects

You can install Verific using your preferred package manager. Below are the commands for npm, yarn, pnpm, and bun.

```bash [npm]
npm add @verific/core
```

```bash [pnpm]
pnpm add @verific/core
```

### Setting Up

#### Importing Verific

After installing Verific, you can import it into your project.

```typescript
import { createVerific } from '@verific/core'
import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)
const verific = createVerific()

app.use(verific)
app.mount('#app')
```

### Creating a Form

Now that you have Verific set up, let's create a simple form to validate.

#### Define a Zod Schema

First, define a Zod schema that represents the data structure you want to validate.

```typescript
import { z } from 'zod'

const userSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  age: z.number().min(18),
})
```

#### Create a Form Component

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

## 📚 Documentation

Read the [documentation and demos](https://verific.josephanson.com/).

## Contributing

You are welcome to contribute to this project, but before you do, please make sure you read the [contribution guide](/CONTRIBUTING.md).

## ⚖️ License

Released under [MIT](/LICENSE) by [@josephanson](https://github.com/josephanson).

# Verific

Vue Validation Library based on Standard Schema

## Overview

Verific is a Vue validation library that works with any validation library that implements the [Standard Schema](https://github.com/standard-schema/standard-schema) interface, such as:

- [Zod](https://github.com/colinhacks/zod)
- [Valibot](https://github.com/fabian-hiller/valibot)
- [ArkType](https://github.com/arktypeio/arktype)

## Installation

```bash
# npm
npm install @verific/core

# yarn
yarn add @verific/core

# pnpm
pnpm add @verific/core
```

## Setup

```ts
// main.ts
import { createApp } from 'vue'
import { createVerific } from '@verific/core'
import App from './App.vue'

const app = createApp(App)

// Initialize Verific
app.use(createVerific({
  // Options
}))

app.mount('#app')
```

## Usage with Zod

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { createValidationScope, useValidate } from '@verific/core'
import { z } from 'zod'

// Create a validation scope
const { showErrors } = createValidationScope()

// Define your form data
const email = ref('')
const password = ref('')

// Define your schema
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

// Use validation
const { errors } = useValidate(schema, {
  email,
  password,
})

// Handle form submission
function onSubmit() {
  showErrors()
  // Handle form submission if no errors
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <div>
      <label for="email">Email</label>
      <input id="email" v-model="email" type="email" />
      <div v-if="errors?.issues">
        {{ errors.issues.find(issue => issue.path?.[0] === 'email')?.message }}
      </div>
    </div>
    
    <div>
      <label for="password">Password</label>
      <input id="password" v-model="password" type="password" />
      <div v-if="errors?.issues">
        {{ errors.issues.find(issue => issue.path?.[0] === 'password')?.message }}
      </div>
    </div>
    
    <button type="submit">Submit</button>
  </form>
</template>
```

## Usage with Valibot

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { createValidationScope, useValidate } from '@verific/core'
import { object, string, email, minLength } from 'valibot'

// Create a validation scope
const { showErrors } = createValidationScope()

// Define your form data
const email = ref('')
const password = ref('')

// Define your schema
const schema = object({
  email: string([email()]),
  password: string([minLength(8)]),
})

// Use validation
const { errors } = useValidate(schema, {
  email,
  password,
})

// Handle form submission
function onSubmit() {
  showErrors()
  // Handle form submission if no errors
}
</script>

<template>
  <!-- Same template as above -->
</template>
```

## Usage with ArkType

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { createValidationScope, useValidate } from '@verific/core'
import { type } from 'arktype'

// Create a validation scope
const { showErrors } = createValidationScope()

// Define your form data
const email = ref('')
const password = ref('')

// Define your schema
const schema = type({
  email: 'string:email',
  password: 'string:min(8)',
})

// Use validation
const { errors } = useValidate(schema, {
  email,
  password,
})

// Handle form submission
function onSubmit() {
  showErrors()
  // Handle form submission if no errors
}
</script>

<template>
  <!-- Same template as above -->
</template>
```

## API Reference

### createVerific(options)

Creates a Verific instance to be used by the application.

```ts
interface VerificOptions {
  useKeysOverStrings?: boolean
}
```

### createValidationScope()

Creates a validation scope that can be used to validate forms.

### useValidate(schema, data)

Validates data against a schema.

- `schema`: A Standard Schema compliant validator
- `data`: An object containing reactive references to form data

### Utility Functions

- `getErrorMessages(result)`: Extracts error messages from a Standard Schema failure result
- `isStandardSchema(value)`: Checks if a value is a Standard Schema compliant validator
- `unwrapSchema(schema)`: Unwraps a MaybeRef value and ensures it's a Standard Schema compliant validator
- `validateWithStandardSchema(schema, data)`: Validates data using a Standard Schema compliant validator

## License

MIT
