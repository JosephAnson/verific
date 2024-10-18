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
npm add verific
```

```bash [pnpm]
pnpm add verific
```

### Setting Up

#### Importing Verific

After installing Verific, you can import it into your project.

```typescript
import { createVerific } from 'verific'
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
import { useError, useValidate } from 'verific'
import { ref } from 'vue'
import { userSchema } from './schemas' // Assuming the schema is in a separate file

const form = ref({
  name: '',
  email: '',
  age: null,
})

const { errors, validate } = useValidate(userSchema, form)

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
