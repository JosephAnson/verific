# Verific Nuxt Module

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

Verific is a Vue validation library that provides a simple and flexible way to validate your forms and data. This module integrates Verific with Nuxt.

## Features

- 🔄 Auto-imports Verific composables
- 🔧 Easy configuration
- 🚀 Works with Nuxt 3

## Quick Setup

1. Add `@verific/nuxt` dependency to your project

```bash
# Using pnpm
pnpm add -D @verific/nuxt

# Using yarn
yarn add --dev @verific/nuxt

# Using npm
npm install --save-dev @verific/nuxt
```

2. Add `@verific/nuxt` to the `modules` section of `nuxt.config.ts`

```js
export default defineNuxtConfig({
  modules: [
    '@verific/nuxt'
  ],
  verific: {
    // Options
  }
})
```

That's it! You can now use Verific in your Nuxt app ✨

## Usage

```vue
<script setup>
// Create a validation scope for the page
createValidationScope()

// Define your form data
const name = ref('')
const email = ref('')

// Define your schema
const schema = {
  '~standard': {
    validate: (data) => {
      const issues = []
      if (!data.name) {
        issues.push({ path: ['name'], message: 'Name is required' })
      }
      if (!data.email) {
        issues.push({ path: ['email'], message: 'Email is required' })
      }
      else if (!/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(data.email)) {
        issues.push({ path: ['email'], message: 'Email is invalid' })
      }
      return issues.length ? { issues } : { success: true }
    }
  }
}

// Use the validation
const { validate, errors } = useValidate(schema, { name, email })

// Handle form submission
async function handleSubmit() {
  const { success } = await validate()
  if (success) {
    // Form is valid, do something
    console.log('Form is valid')
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <div>
      <label for="name">Name</label>
      <input id="name" v-model="name" type="text">
      <div v-if="errors.name?._errors.length">
        {{ errors.name._errors[0] }}
      </div>
    </div>

    <div>
      <label for="email">Email</label>
      <input id="email" v-model="email" type="email">
      <div v-if="errors.email?._errors.length">
        {{ errors.email._errors[0] }}
      </div>
    </div>

    <button type="submit">
      Submit
    </button>
  </form>
</template>
```

## Options

You can configure the Verific module using the `verific` property in your `nuxt.config.ts`:

```js
export default defineNuxtConfig({
  modules: [
    '@verific/nuxt'
  ],
  verific: {
    global: true, // Enable or disable the Verific plugin globally
    config: {
      useKeysOverStrings: false // Use keys over strings for error messages
    }
  }
})
```

## Development

```bash
# Install dependencies
pnpm install

# Generate type stubs
pnpm run dev:prepare

# Develop with the playground
pnpm run dev

# Build the module
pnpm run build
```

## License

[MIT License](./LICENSE)

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@verific/nuxt/latest.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-version-href]: https://npmjs.com/package/@verific/nuxt

[npm-downloads-src]: https://img.shields.io/npm/dm/@verific/nuxt.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-downloads-href]: https://npmjs.com/package/@verific/nuxt

[license-src]: https://img.shields.io/npm/l/@verific/nuxt.svg?style=flat&colorA=18181B&colorB=28CF8D
[license-href]: https://npmjs.com/package/@verific/nuxt

[nuxt-src]: https://img.shields.io/badge/Nuxt-18181B?logo=nuxt.js
[nuxt-href]: https://nuxt.com
