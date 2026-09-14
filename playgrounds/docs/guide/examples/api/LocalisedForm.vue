<script setup lang="ts">
import { useValidation } from '@verific/core'
import { reactive } from 'vue'
import { z } from 'zod'

const form = reactive({ email: '' })
const schema = z.object({ email: z.email() })
const { errorsFor, hasError, isValidating, validate } = useValidation(schema, form, {
  messagePrefix: 'forms.signup',
})
</script>

<template>
  <form novalidate aria-describedby="required-instructions" @submit.prevent="validate">
    <p id="required-instructions">
      Email is required.
    </p>
    <label for="email">Email</label>
    <input
      id="email"
      v-model="form.email"
      type="email"
      autocomplete="email"
      required
      :aria-invalid="hasError('email')"
      aria-describedby="email-errors"
      @blur="validate('email')"
    >
    <div id="email-errors" aria-live="polite" aria-atomic="true">
      <p v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
        {{ error }}
      </p>
    </div>
    <button type="submit" :disabled="isValidating">
      Validate
    </button>
  </form>
</template>
