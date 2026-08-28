<script setup lang="ts">
import { ref } from 'vue'
import { z } from 'zod'

const schema = z.object({
  email: z.string().min(1).email(),
  password: z.string().min(6).max(20),
  confirmPassword: z.string().min(1),
}).refine(data => data.password === data.confirmPassword, {
  path: ['confirmPassword'],
})

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const { errorFor, errorsFor } = useValidation(schema, { email, password, confirmPassword })
</script>

<template>
  <UFormField label="Email" name="email" :error="errorFor('email')">
    <UInput v-model="email" type="email" />
    <template #error>
      <p v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
        {{ error }}
      </p>
    </template>
  </UFormField>

  <UFormField label="Password" name="password" :error="errorFor('password')">
    <UInput v-model="password" type="password" />
    <template #error>
      <p v-for="(error, index) in errorsFor('password')" :key="`${index}:${error}`">
        {{ error }}
      </p>
    </template>
  </UFormField>

  <UFormField label="Confirm password" name="confirmPassword" :error="errorFor('confirmPassword')">
    <UInput v-model="confirmPassword" type="password" />
    <template #error>
      <p v-for="(error, index) in errorsFor('confirmPassword')" :key="`${index}:${error}`">
        {{ error }}
      </p>
    </template>
  </UFormField>
</template>
