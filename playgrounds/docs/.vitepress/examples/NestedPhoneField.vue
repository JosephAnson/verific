<script setup lang="ts">
import { useValidation } from '@verific/core'
import { ref } from 'vue'
import { z } from 'zod'

const phone = ref('')
const { errorsFor } = useValidation(
  z.object({ phone: z.string().min(1, 'Enter a phone number') }),
  { phone },
)
</script>

<template>
  <div class="verific-example__field">
    <label for="nested-phone">Phone number</label>
    <input
      id="nested-phone"
      v-model="phone"
      type="tel"
      autocomplete="tel"
      :aria-invalid="errorsFor('phone').length > 0"
      aria-describedby="nested-phone-errors"
    >
    <ul id="nested-phone-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
      <li v-for="(error, index) in errorsFor('phone')" :key="`${index}:${error}`">
        {{ error }}
      </li>
    </ul>
  </div>
</template>
