<script setup lang="ts">
import { createValidationScope, ErrorMessages, useValidate } from '@verific/core'
import { ref } from 'vue'
import { z } from 'zod'

const validationSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(20, 'Password is too long'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords don\'t match',
  path: ['confirmPassword'],
})

const email = ref('')
const password = ref('')
const confirmPassword = ref('')

const { validate } = createValidationScope()
const { errors } = useValidate(validationSchema, {
  email,
  password,
  confirmPassword,
})

console.log(validationSchema)


async function onSubmit(event: Event) {
  event.preventDefault()
  const result = await validate()
  if (!result.success) {
    return
  }
  // eslint-disable-next-line no-console
  console.log({
    title: 'Success',
    description: 'The form has been submitted.',
    data: { email: email.value, password: password.value },
  })
}
</script>

<template>
  {{ types }}
  <UContainer class="p-20">
    <h1 class="text-2xl font-bold mb-6">
      Zod Validation Example
    </h1>

    <form class="space-y-4" @submit="onSubmit">
      <UFormGroup
        label="Email"
        name="email"
        :error="!!errors.email?._errors?.length"
      >
        <UInput v-model="email" type="email" />
        <div class="space-y-1 mt-2">
          <ErrorMessages
            :messages="errors.email?._errors?.reduce((acc, msg) => ({ ...acc, [msg]: true }), {}) || {}"
            class="w-full text-sm block text-red-400"
          />
        </div>
      </UFormGroup>

      <UFormGroup
        label="Password"
        name="password"
        :error="!!errors.password?._errors?.length"
      >
        <UInput v-model="password" type="password" />
        <div class="space-y-1 mt-2">
          <ErrorMessages
            :messages="errors.password?._errors?.reduce((acc, msg) => ({ ...acc, [msg]: true }), {}) || {}"
            class="w-full text-sm block text-red-400"
          />
        </div>
      </UFormGroup>

      <UFormGroup
        label="Confirm Password"
        name="confirmPassword"
        :error="!!errors.confirmPassword?._errors?.length"
      >
        <UInput v-model="confirmPassword" type="password" />
        <div class="space-y-1 mt-2">
          <ErrorMessages
            :messages="errors.confirmPassword?._errors?.reduce((acc, msg) => ({ ...acc, [msg]: true }), {}) || {}"
            class="w-full text-sm block text-red-400"
          />
        </div>
      </UFormGroup>

      <UButton type="submit" class="mt-6">
        Submit
      </UButton>
    </form>

    <div class="mt-8 p-4 bg-gray-900 rounded">
      <h2 class="text-lg font-semibold mb-2">
        Validation Errors:
      </h2>
      <pre class="text-sm">{{ errors }}</pre>
    </div>
  </UContainer>
</template>
