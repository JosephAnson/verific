<script setup lang="ts">
import { useValidation } from '@verific/core'
import { ref } from 'vue'
import { z } from 'zod'

const name = ref('')
const { errorsFor } = useValidation(
  z.object({ name: z.string().min(1, 'Enter a name') }),
  { name },
)
</script>

<template>
  <div class="verific-example__field">
    <label for="nested-name">Name</label>
    <input
      id="nested-name"
      v-model="name"
      type="text"
      autocomplete="name"
      required
      :aria-invalid="errorsFor('name').length > 0"
      aria-describedby="nested-name-errors"
    >
    <ul id="nested-name-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
      <li v-for="(error, index) in errorsFor('name')" :key="`${index}:${error}`">
        {{ error }}
      </li>
    </ul>
  </div>
</template>
