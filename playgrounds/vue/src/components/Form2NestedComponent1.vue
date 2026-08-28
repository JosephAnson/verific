<script setup lang="ts">
import { useValidation } from '@verific/core'
import InputText from 'primevue/inputtext'
import { ref } from 'vue'
import { z } from 'zod'

const schema = z.object({
  firstName: z.string().min(1).max(8),
})

const firstName = ref('')

const { errorsFor } = useValidation(schema, {
  firstName,
})
</script>

<template>
  <div class="container">
    <div class="flex-col flex">
      <label for="firstName">First Name</label>
      <InputText id="firstName" v-model="firstName" type="text" />
      <span
        v-for="(error, index) in errorsFor('firstName')"
        :key="`${index}:${error}`"
        class="w-full text-sm block text-red-400"
      >{{ error }}</span>
    </div>
  </div>
</template>
