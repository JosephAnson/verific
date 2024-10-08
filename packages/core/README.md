<p align="center">
  <a href="https://verific.josephanson.com" target="_blank">
    <img src="https://raw.githubusercontent.com/josephanson/verific/main/logo.png" width="200" title="Go to website">
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

<a href="https://verific.josephanson.com/v4/" target="_blank">
  <img src="https://img.shields.io/badge/-docs%20and%20demos-009f53">
</a>

<a href="https://github.com/sponsors/josephanson">
  <img src="https://img.shields.io/badge/-%E2%99%A5%20Sponsors-ec5cc6">

</a>

</p>

<br>

<p align="center">
  <a href="https://github.com/sponsors/josephanson">
    <img src='https://sponsors.josephanson.com/sponsors.svg'>
  </a>
</p>

<br>

## Features

- **🍞 Easy:** Declarative validation that is familiar and easy to setup
- **🧘‍♀️ Flexible:** Synchronous, Asynchronous, field-level or form-level validation
- **⚡️ Fast:** Build faster forms faster with intuitive API and small footprint
- **🏏 Minimal:** Only handles the complicated form concerns, gives you full control over everything else
- **😎 UI Agnostic:** Works with native HTML elements or your favorite UI library components
- **🦾 Progressive:** Works whether you use Vue.js as a progressive enhancement or in a complex setup
- **✅ Built-in Rules:** Companion lib with 25+ Rules that covers most needs in most web applications
- **🌐 i18n:** 45+ locales for built-in rules contributed by developers from all over the world

## Getting Started

### Installation

```sh
# Install with yarn
yarn add verific

# Install with npm
npm install verific --save
```

### Vue version support

The main v4 version supports Vue 3.x only, for previous versions of Vue, check the following the table

| vue Version | verific version | Documentation Link                                                                       |
| ----------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `2.x`       | `2.x` or `3.x`       | [v2](https://verific.josephanson.com/v2) or [v3](https://verific.josephanson.com/v3) |
| `3.x`       | `4.x`                | [v4](https://verific.josephanson.com/v4)                                               |

### Usage

verific offers two styles to integrate form validation into your Vue.js apps.

#### Composition API

The fastest way to create a form and manage its validation, behavior, and values is with the composition API.

Create your form with `useForm` and then use `defineField` to create your field model and props/attributes and `handleSubmit` to use the values and send them to an API.

```vue
<script setup>
import { useForm } from 'verific'

// Validation, or use `yup` or `zod`
function required(value) {
  return value ? true : 'This field is required'
}

// Create the form
const { defineField, handleSubmit, errors } = useForm({
  validationSchema: {
    field: required,
  },
})

// Define fields
const [field, fieldProps] = defineField('field')

// Submit handler
const onSubmit = handleSubmit((values) => {
  // Submit to API
  console.log(values)
})
</script>

<template>
  <form @submit="onSubmit">
    <input v-model="field" v-bind="fieldProps">
    <span>{{ errors.field }}</span>

    <button>Submit</button>
  </form>
</template>
```

You can do so much more than this, for more info [check the composition API documentation](https://verific.josephanson.com/v4/guide/composition-api/getting-started/).

#### Declarative Components

Higher-order components can also be used to build forms. Register the `Field` and `Form` components and create a simple `required` validator:

```vue
<script setup>
import { Field, Form } from 'verific'

// Validation, or use `yup` or `zod`
function required(value) {
  return value ? true : 'This field is required'
}

// Submit handler
function onSubmit(values) {
  // Submit to API
  console.log(values)
}
</script>

<template>
  <Form v-slot="{ errors }" @submit="onSubmit">
    <Field name="field" :rules="required" />

    <span>{{ errors.field }}</span>

    <button>Submit</button>
  </Form>
</template>
```

The `Field` component renders an `input` of type `text` by default but you can [control that](https://verific.josephanson.com/v4/api/field#rendering-fields)

## 📚 Documentation

Read the [documentation and demos](https://verific.josephanson.com/v4).

## Contributing

You are welcome to contribute to this project, but before you do, please make sure you read the [contribution guide](/CONTRIBUTING.md).

## Credits

- Inspired by Laravel's [validation syntax](https://laravel.com/docs/5.4/validation)
- v4 API Inspired by [Formik's](https://github.com/formium/formik)
- Nested path types by [react-hook-form](https://github.com/react-hook-form/react-hook-form)
- Logo by [Baianat](https://github.com/baianat)

## Emeriti

Here we honor past contributors and sponsors who have been a major part on this project.

- [Baianat](https://github.com/baianat).

## ⚖️ License

Released under [MIT](/LICENSE) by [@josephanson](https://github.com/josephanson).
