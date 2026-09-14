<script setup lang="ts">
import type { Contact } from './contact'
import { useValidation } from '@verific/core'
import { postalAddressSchema } from './contact'

const address = defineModel<Contact['address']>({ required: true })
const { errorsFor, hasError, validate } = useValidation(postalAddressSchema, address, { at: ['address'] })
</script>

<template>
  <div>
    <label for="contact-postcode">Postcode</label>
    <input
      id="contact-postcode"
      v-model="address.postcode"
      type="text"
      autocomplete="postal-code"
      required
      :aria-invalid="hasError('postcode')"
      aria-describedby="contact-postcode-errors"
      @blur="validate('postcode')"
    >
    <ul id="contact-postcode-errors" aria-live="polite">
      <li v-for="(error, index) in errorsFor('postcode')" :key="`${index}:${error}`">
        {{ error }}
      </li>
    </ul>
  </div>
</template>
