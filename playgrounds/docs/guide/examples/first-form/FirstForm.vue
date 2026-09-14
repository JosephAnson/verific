<script setup lang="ts">
import { useValidation } from '@verific/core'
import { reactive } from 'vue'
import { z } from 'zod'

const model = reactive({ email: '' })
const schema = z.object({ email: z.email('Enter a valid email address') })
const { errorsFor, hasError, result, state, validate } = useValidation(schema, model)
</script>

<template>
  <form novalidate aria-describedby="first-form-required" @submit.prevent="validate()">
    <p id="first-form-required">
      Email is required.
    </p>
    <label for="first-form-email">Email address</label>
    <input
      id="first-form-email"
      v-model="model.email"
      type="email"
      autocomplete="email"
      required
      :aria-invalid="hasError('email')"
      aria-describedby="first-form-email-errors"
      @blur="validate('email')"
    >
    <ul id="first-form-email-errors" aria-live="polite">
      <li v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
        {{ error }}
      </li>
    </ul>
    <button type="submit" :disabled="state.validating">
      Validate email
    </button>
    <p v-if="result.status === 'valid' && state.validated && !state.stale" role="status">
      The email address is valid.
    </p>
  </form>
</template>
