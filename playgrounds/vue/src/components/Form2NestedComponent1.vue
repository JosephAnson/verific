<script setup lang="ts">
import { ErrorMessages, useError, useValidate } from '@verific/core'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { ref } from 'vue'
import { z } from 'zod'

const schema = z.object({
  firstName: z.string().min(1).max(8),
})

const firstName = ref('')

const { errors } = useValidate(schema, {
  firstName,
})
</script>

<template>
  <div class="container">
    <div class="flex-col flex">
      <label for="firstName">First Name</label>
      <InputText id="firstName" v-model="firstName" type="password" />
      <ErrorMessages
        :as="Message"
        severity="error"
        :messages="{
          ['This field is required']: useError(errors.firstName, 'too_small'),
          ['Enter less than 8 characters']: useError(errors.firstName, 'too_big'),
        }"
        class="w-full text-sm block text-red-400"
      />
    </div>
  </div>
</template>
