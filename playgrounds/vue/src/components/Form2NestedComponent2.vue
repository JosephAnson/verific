<script setup lang="ts">
import { ErrorMessages, useError, useValidate } from '@verific/core'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { ref } from 'vue'
import { z } from 'zod'

const schema = z.object({
  lastName: z.string().min(5).max(10),
})

const lastName = ref('')

const { errors } = useValidate(schema, {
  lastName,
})
</script>

<template>
  <div class="container">
    <div class="flex-col flex">
      <label for="lastName">Last Name</label>
      <InputText id="lastName" v-model="lastName" type="password" />
      <ErrorMessages
        :as="Message"
        severity="error"
        :messages="{
          ['Min length of 5 characters']: useError(errors.lastName, 'too_small'),
          ['Enter less than 10 characters']: useError(errors.lastName, 'too_big'),
        }"
        class="w-full text-sm block text-red-400"
      />
    </div>
  </div>
</template>
