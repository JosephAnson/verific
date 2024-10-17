To create a Nuxt plugin guide for the `@verific/nuxt` plugin, you can follow these steps. This guide will help users integrate the `@verific/nuxt` module into their Nuxt projects.

### Nuxt Plugin Guide

#### Introduction

The `@verific/nuxt` module is an official Nuxt module for integrating the Verific library, which provides model-based validation for Vue 3 applications. This guide will walk you through the steps to set up and configure the module in your Nuxt project.

#### Installation

First, you need to install the `@verific/nuxt` module. You can do this using npm, pnpm, or yarn:

::: code-group

```bash [npm]
npm i @verific/nuxt
```

```bash [pnpm]
pnpm add @verific/nuxt
```

```bash [yarn]
yarn add @verific/nuxt
```

:::

#### Configuration

After installing the module, add it to your `nuxt.config.ts` file under the `modules` section:

```typescript [nuxt.config.ts]
// nuxt.config.ts
export default defineNuxtConfig({
  // ...
  modules: [
    // ...
    '@verific/nuxt',
  ],
})
```

You can also configure the module by providing options. For example, you can enable or disable auto imports and customize component names:

```typescript [nuxt.config.ts]
export default defineNuxtConfig({
  // ...
  modules: [
    // ...
    [
      '@verific/nuxt',
      {
        autoImports: true,
      },
    ],
  ],
})
```

Alternatively, you can use the `Verific` config key:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  // ...
  modules: [
    // ...
    '@verific/nuxt',
  ],
  verific: {
    autoImports: true,
  },
})
```

#### Usage

Once configured, you can use the `useValidate` and `useProvideValidate` composables in your components to handle validation logic. These composables are automatically imported if `autoImports` is enabled.

For example, in a Vue component, you can use these composables as follows:

```vue
<script setup>
import { useValidate } from '#imports'
import { ref } from 'vue'

const formData = ref({
  name: '',
  email: '',
})

const { validate, errors } = useValidate(
  z.object({
    name: z.string().min(3),
    email: z.string().email(),
  }),
  formData
)

function handleSubmit() {
  const result = validate()
  if (!result.success) {
    console.log(errors.value)
  }

  // handle successful validation
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <!-- form fields -->
    <input v-model="formData.name" type="text">
    <span v-if="hasError(errors.name, 'too_small')">Name must be at least 3 characters long.</span>
    <input v-model="formData.email" type="email">
    <span v-if="hasError(errors.email, 'invalid_email')">Please enter a valid email address.</span>
    <button type="submit">
      Submit
    </button>
  </form>
</template>
```

#### Conclusion

The `@verific/nuxt` module simplifies the integration of Verific's validation capabilities into your Nuxt application. By following this guide, you can quickly set up and start using the module to enhance your form validation processes.

For more detailed information, refer to the official documentation and explore the various features and configurations available.
