<script setup lang="ts">
import { useValidation } from '@verific/core'
import { ref } from 'vue'
import { z } from 'zod'

const schema = z.object({
  lastName: z.string().min(5).max(10),
})

const lastName = ref('')

const { errorsFor } = useValidation(schema, {
  lastName,
})
</script>

<template>
  <div class="container">
    <div class="flex-col flex">
      <label for="lastName">Last Name</label>
      <input id="lastName" v-model="lastName" type="text">
      <span
        v-for="(error, index) in errorsFor('lastName')"
        :key="`${index}:${error}`"
        class="w-full text-sm block text-red-400"
      >{{ error }}</span>
    </div>
  </div>
</template>
