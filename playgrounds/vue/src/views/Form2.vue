<script setup lang="ts">
import { createValidationScope } from '@verific/core'
import Form2NestedComponent1 from '../components/Form2NestedComponent1.vue'
import Form2NestedComponent2 from '../components/Form2NestedComponent2.vue'

const { validate, errors } = createValidationScope()

async function onSubmit(event: Event) {
  event.preventDefault()
  const result = await validate()
  if (!result.success) {
    return
  }
  // eslint-disable-next-line no-console
  console.log({ title: 'Success', description: 'The form has been submitted.' })
}
</script>

<template>
  <div class="container">
    <h1 class="mb-4 font-bold text-lg">
      Nest form components with parent validation
    </h1>
    <form class="space-y-4" @submit="onSubmit">
      <Form2NestedComponent1 />
      <Form2NestedComponent2 />
      <button type="submit" :disabled="!errors">
        Submit
      </button>
    </form>
  </div>
</template>
