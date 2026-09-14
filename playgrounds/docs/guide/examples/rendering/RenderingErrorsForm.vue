<script setup lang="ts">
import { useValidation } from '@verific/core'
import { reactive } from 'vue'
import { z } from 'zod'

const form = reactive({ email: '' })
const schema = z.object({ email: z.email('Enter a valid email address') })
const { errorsFor, hasError, state, validate } = useValidation(schema, form)
</script>

<template>
  <form novalidate aria-describedby="rendering-required-instructions" @submit.prevent="validate()">
    <p id="rendering-required-instructions">
      Email is required.
    </p>
    <label for="rendering-email">Email address</label>
    <input
      id="rendering-email"
      v-model="form.email"
      type="email"
      autocomplete="email"
      required
      :aria-invalid="hasError('email')"
      aria-describedby="rendering-email-errors"
      @blur="validate('email')"
    >

    <ul id="rendering-email-errors" aria-live="polite">
      <li v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
        {{ error }}
      </li>
    </ul>

    <button type="submit" :disabled="state.validating">
      Validate email
    </button>
  </form>
</template>
