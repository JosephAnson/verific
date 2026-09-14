<script setup lang="ts">
import type { Contact } from './contact'
import { useValidation } from '@verific/core'
import { contactDetailsSchema } from './contact'

const details = defineModel<Contact['details']>({ required: true })
const { errorsFor, hasError, validate } = useValidation(contactDetailsSchema, details, { at: ['details'] })
</script>

<template>
  <div>
    <label for="contact-email">Email address</label>
    <input
      id="contact-email"
      v-model="details.email"
      type="email"
      autocomplete="email"
      required
      :aria-invalid="hasError('email')"
      aria-describedby="contact-email-errors"
      @blur="validate('email')"
    >
    <ul id="contact-email-errors" aria-live="polite">
      <li v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
        {{ error }}
      </li>
    </ul>
  </div>
</template>
