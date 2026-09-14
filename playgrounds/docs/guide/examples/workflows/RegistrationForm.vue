<script setup lang="ts">
import type { User, UserInput } from './user'
import { useValidation } from '@verific/core'
import { reactive, ref } from 'vue'
import { userSchema } from './user'
import { registerUser } from './user-service'

const { save = registerUser } = defineProps<{
  save?: (user: User) => Promise<void>
}>()

const form = reactive<UserInput>({ email: '', displayName: '' })
const { errorsFor, hasError, result, resetState, state, validate } = useValidation(userSchema, form, { scope: 'new' })
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
    if (!outcome.success) {
      status.value = 'Check the highlighted fields.'
      return
    }
    if (result.value.status !== 'valid' || !state.value.validated || state.value.stale) {
      status.value = 'The values changed during validation. Review them and submit again.'
      return
    }

    // Both shapes contain only strings, so these copies are independent snapshots.
    const raw = { ...form }
    const payload = { ...result.value.value }
    await save(payload)

    if (form.email === raw.email && form.displayName === raw.displayName) {
      resetState()
      status.value = 'Saved.'
    }
    else {
      status.value = 'Saved the earlier values. Your newer edits have been kept.'
    }
  }
  catch {
    saveError.value = 'Could not complete validation or saving. Your values have been kept; please try again.'
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form
    novalidate
    :aria-busy="isSubmitting"
    aria-describedby="registration-required-instructions"
    @submit.prevent="submit"
  >
    <p id="registration-required-instructions">
      All fields are required. You can keep editing while saving.
    </p>
    <label for="registration-email">Email address</label>
    <input
      id="registration-email"
      v-model="form.email"
      type="email"
      autocomplete="email"
      required
      :aria-invalid="hasError('email')"
      aria-describedby="registration-email-errors"
    >
    <ul id="registration-email-errors" aria-live="polite">
      <li v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
        {{ error }}
      </li>
    </ul>

    <label for="registration-display-name">Display name</label>
    <input
      id="registration-display-name"
      v-model="form.displayName"
      type="text"
      autocomplete="nickname"
      required
      :aria-invalid="hasError('displayName')"
      aria-describedby="registration-display-name-errors"
    >
    <ul id="registration-display-name-errors" aria-live="polite">
      <li v-for="(error, index) in errorsFor('displayName')" :key="`${index}:${error}`">
        {{ error }}
      </li>
    </ul>

    <button type="submit" :disabled="isSubmitting">
      {{ isSubmitting ? 'Saving…' : 'Register' }}
    </button>
    <p role="status">
      {{ status }}
    </p>
    <p v-if="saveError" role="alert">
      {{ saveError }}
    </p>
    <p aria-live="polite">
      {{ state.dirty ? 'Changed from baseline.' : 'Unchanged from baseline.' }}
    </p>
  </form>
</template>
