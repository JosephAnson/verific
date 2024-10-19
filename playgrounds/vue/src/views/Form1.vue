<script setup lang="ts">
import { createValidationScope, ErrorMessages, useError, useValidate } from '@verific/core'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { ref } from 'vue'
import { z } from 'zod'

const schema = z.object({
  email: z.string().min(1).email(),
  password: z.string().min(1).max(8),
})

const email = ref('')
const password = ref('')

const { validate } = createValidationScope()
const { errors } = useValidate(schema, {
  email,
  password,
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
        <InputText v-model="email" type="email" />
        <ErrorMessages
          :as="Message"
          severity="error"
          :messages="{
            ['This field is required']: useError(errors.email, 'too_small'),
            ['This string is valid']: useError(errors.email, 'invalid_string'),
          }"
          class="w-full text-sm block text-red-400"
        />
      </div>
      <div class="flex-col flex">
        <InputText v-model="password" type="password" />
        <ErrorMessages
          :as="Message"
          severity="error"
          :messages="{
            ['This field is required']: useError(errors.password, 'too_small'),
          }"
          class="w-full text-sm block text-red-400"
        />
      </div>
      <button type="submit">
        Submit
      </button>
    </form>
  </div>
</template>
