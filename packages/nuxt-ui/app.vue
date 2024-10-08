<script setup lang="ts">
import { useError, useProvideValidate, useValidate } from '@verific/core'
import { ref } from 'vue'
import { z } from 'zod'

const schema = z.object({
  email: z.string().min(1).email(),
  password: z.string().min(1).max(8),
})

const email = ref('')
const password = ref('')

useProvideValidate()

const { validate, errors } = useValidate(schema, {
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
  <UContainer class="p-20">
    <form class="space-y-4" @submit="onSubmit">
      <UFormGroup
        label="Email"
        name="email"
        :error="!!Object.keys(errors).length"
      >
        <UInput v-model="email" type="email" />
        <div class="space-y-1 mt-2">
          <span v-if="useError(errors.email, 'too_small')" class="w-full text-sm block text-red-400">This field is required</span>
          <span v-if="useError(errors.email, 'invalid_string')" class="w-full text-sm block text-red-400">This string is valid</span>
        </div>
      </UFormGroup>

      <UFormGroup
        label="Password"
        name="password"
        :error="useError(errors.password, 'too_small') && 'This field is required'"
      >
        <UInput v-model="password" type="password" />
      </UFormGroup>

      <UButton type="submit">
        Submit
      </UButton>
    </form>
  </UContainer>
</template>
