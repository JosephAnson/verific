<script setup lang="ts">
import { useValidation } from '@verific/core'
import { computed, nextTick, ref } from 'vue'
import { z } from 'zod'

const schema = z.object({
  email: z.string()
    .min(1, 'Enter your email address')
    .refine(value => value === '' || z.email().safeParse(value).success, 'Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
})

const email = ref('')
const password = ref('')
const { errorsFor, hasError, isValidating, issues, result, state, touch, validate, validateAt } = useValidation(schema, { email, password })
const outcome = computed(() => {
  const issueCount = issues.value.length

  if (result.value.status === 'idle' && issueCount === 0)
    return 'Submit the form to validate it.'

  if (state.value.stale)
    return 'The account details changed after validation. Validate again.'

  if (
    result.value.status === 'valid'
    && state.value.validated
    && !state.value.stale
    && issueCount === 0
  ) {
    return 'The account details are valid.'
  }

  if (issueCount === 0)
    return 'No field errors are shown. Submit the form to confirm.'

  return `Please resolve ${issueCount} validation ${issueCount === 1 ? 'error' : 'errors'}.`
})

async function focusFirstInvalid(path: readonly PropertyKey[] | undefined) {
  await nextTick()
  const field = path?.[0]
  if (field === 'email' || field === 'password') {
    document.getElementById(`basic-${field}`)?.focus()
  }
}

async function onFieldBlur(path: 'email' | 'password') {
  touch(path)
  await validateAt(path)
}

async function onSubmit() {
  const result = await validate()
  if (!result.success) {
    await focusFirstInvalid(result.issues[0]?.path)
  }
}
</script>

<template>
  <div class="verific-example">
    <form novalidate aria-describedby="basic-required-instructions" @submit.prevent="onSubmit">
      <p id="basic-required-instructions" class="verific-example__required">
        All fields are required.
      </p>
      <div class="verific-example__grid">
        <div class="verific-example__field">
          <label for="basic-email">Email address</label>
          <input
            id="basic-email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            :aria-invalid="hasError('email')"
            aria-describedby="basic-email-errors"
            @blur="onFieldBlur('email')"
          >
          <ul id="basic-email-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
            <li v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
              {{ error }}
            </li>
          </ul>
        </div>

        <div class="verific-example__field">
          <label for="basic-password">Password</label>
          <input
            id="basic-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            :aria-invalid="hasError('password')"
            aria-describedby="basic-password-errors"
            @blur="onFieldBlur('password')"
          >
          <ul id="basic-password-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
            <li v-for="(error, index) in errorsFor('password')" :key="`${index}:${error}`">
              {{ error }}
            </li>
          </ul>
        </div>
      </div>

      <div class="verific-example__actions">
        <button type="submit" :disabled="isValidating">
          {{ isValidating ? 'Validating…' : 'Validate account' }}
        </button>
      </div>

      <p class="verific-example__outcome" role="status" aria-live="polite">
        {{ outcome }}
      </p>
    </form>
  </div>
</template>
