<script setup lang="ts">
import { useValidation } from '@verific/core'
import { ref } from 'vue'
import { z } from 'zod'

const schema = z.object({
  email: z.string().min(1).email(),
  password: z.string().min(1).max(8),
})

const email = ref('')
const password = ref('')

const { errorsFor, isValidating, validate } = useValidation(schema, {
  email,
  password,
}, {
  messagePrefix: 'forms.account',
})

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
      Form components in page alongside validation
    </h1>
    <form class="space-y-4" @submit="onSubmit">
      <div class="flex-col flex">
        <label for="form1-email">Email</label>
        <input
          id="form1-email"
          v-model="email"
          class="rounded border border-gray-500 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          type="email"
        >
        <span
          v-for="(error, index) in errorsFor('email')"
          :key="`${index}:${error}`"
          class="w-full text-sm block text-red-400"
        >{{ error }}</span>
      </div>
      <div class="flex-col flex">
        <label for="form1-password">Password</label>
        <input
          id="form1-password"
          v-model="password"
          class="rounded border border-gray-500 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          type="password"
        >
        <span
          v-for="(error, index) in errorsFor('password')"
          :key="`${index}:${error}`"
          class="w-full text-sm block text-red-400"
        >{{ error }}</span>
      </div>
      <button type="submit" :disabled="isValidating">
        Submit
      </button>
    </form>
  </div>
</template>
