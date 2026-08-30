<script setup lang="ts">
import { useValidation } from '@verific/core'
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
      <input
        id="firstName"
        v-model="firstName"
        class="rounded border border-gray-500 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        type="text"
      >
      <span
        v-for="(error, index) in errorsFor('firstName')"
        :key="`${index}:${error}`"
        class="w-full text-sm block text-red-400"
      >{{ error }}</span>
    </div>
  </div>
</template>
