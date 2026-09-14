<script setup lang="ts">
import type { Contact } from './contact'
import { useValidation } from '@verific/core'
import { reactive, ref } from 'vue'
import { saveContact } from './contact-service'
import ContactDetails from './ContactDetails.vue'
import PostalAddress from './PostalAddress.vue'

const { save = saveContact } = defineProps<{
  save?: (contact: Contact) => Promise<void>
}>()

const form = reactive<Contact>({ details: { email: '' }, address: { postcode: '' } })
const { resetState, state, validate } = useValidation({ scope: 'new' })
const isSubmitting = ref(false)
const saveError = ref('')
const status = ref('')

async function submit() {
  if (isSubmitting.value)
    return

  isSubmitting.value = true
  saveError.value = ''
  status.value = ''
  try {
    const outcome = await validate()
    if (!outcome.success || !state.value.validated || state.value.stale) {
      status.value = 'Review the contact details and address, then submit again.'
      return
    }

    // These schemas do not transform: the parent's raw strings are the payload.
    const payload = { details: { ...form.details }, address: { ...form.address } }
    const email = form.details.email
    const postcode = form.address.postcode
    await save(payload)

    if (form.details.email === email && form.address.postcode === postcode) {
      resetState()
      status.value = 'Contact saved.'
    }
    else {
      status.value = 'Contact saved with the earlier values. Your newer edits have been kept.'
    }
  }
  catch {
    saveError.value = 'Could not complete validation or saving. Your contact details have been kept; please try again.'
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form novalidate :aria-busy="isSubmitting" aria-describedby="contact-required-instructions" @submit.prevent="submit">
    <p id="contact-required-instructions">
      Email address and postcode are required.
    </p>
    <ContactDetails v-model="form.details" />
    <PostalAddress v-model="form.address" />
    <button type="submit" :disabled="isSubmitting">
      {{ isSubmitting ? 'Saving…' : 'Save contact' }}
    </button>
    <p role="status">
      {{ status }}
    </p>
    <p v-if="saveError" role="alert">
      {{ saveError }}
    </p>
  </form>
</template>
