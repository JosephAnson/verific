<script setup lang="ts">
import type { CatalogueMissingMessageDiagnostic } from '@verific/i18n'
import { useValidation } from '@verific/core'
import { paraglideMessages } from '@verific/paraglide'
import { computed, ref } from 'vue'
import { z } from 'zod'
import { errors_invalid_email } from '../../guide/localisation/examples/paraglide/messages/errors_invalid_email.js'

const locale = ref<'en' | 'es'>('en')
const email = ref('not-an-email')
const runCount = ref(0)
const demonstrateMissing = ref(false)
const missingSequence = ref(0)
const missingDiagnostic = ref('')
const schema = z.object({
  email: z.email('Schema fallback: enter a valid email address'),
}).superRefine(() => {
  runCount.value += 1
})
const messages = paraglideMessages({
  'errors.invalidEmail': errors_invalid_email,
}, {
  fallbackPrefix: 'errors',
  key: ({ defaultKeys }) => demonstrateMissing.value
    ? [`demo.missing.${missingSequence.value}`]
    : defaultKeys,
  locale: () => locale.value,
  missing: reportMissing,
})
const outcome = ref('Validate once, then change the locale.')
const { errorsFor, hasError, isValidating, state, validate } = useValidation(
  schema,
  { email },
  { messages },
)
const visibleOutcome = computed(() => (
  state.value.stale
    ? 'The email address changed after validation. Validate again.'
    : outcome.value
))

async function onSubmit() {
  const result = await validate()
  if (!result.success) {
    outcome.value = 'The committed error is translated when the locale changes.'
    document.getElementById('paraglide-email')?.focus()
    return
  }

  outcome.value = state.value.validated && !state.value.stale
    ? 'The email address is valid.'
    : 'The email address changed during validation. Validate again.'
}

function reportMissing(diagnostic: CatalogueMissingMessageDiagnostic) {
  const attempt = diagnostic.attempts[0]
  const key = attempt?.keys[0] ?? 'unknown key'
  const attemptedLocale = attempt?.locale ?? 'unknown locale'
  missingDiagnostic.value = `Missing catalogue message. Add "${key}" for locale "${attemptedLocale}".`
}

function toggleMissingDemonstration() {
  missingDiagnostic.value = ''
  demonstrateMissing.value = !demonstrateMissing.value
  if (demonstrateMissing.value) {
    missingSequence.value += 1
  }
}
</script>

<template>
  <div class="verific-example">
    <form novalidate aria-describedby="paraglide-demo-required-instructions" @submit.prevent="onSubmit">
      <p id="paraglide-demo-required-instructions" class="verific-example__required">
        Email is required.
      </p>
      <div class="verific-example__toolbar">
        <div class="verific-example__field">
          <label for="paraglide-locale">Message language</label>
          <select id="paraglide-locale" v-model="locale" data-validation-skip>
            <option value="en">
              English
            </option>
            <option value="es">
              Español
            </option>
          </select>
        </div>
        <p class="verific-example__counter" aria-live="polite">
          Validation runs: <strong>{{ runCount }}</strong>
        </p>
      </div>

      <div class="verific-example__field">
        <label for="paraglide-email">Email address</label>
        <input
          id="paraglide-email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          :aria-invalid="hasError('email')"
          aria-describedby="paraglide-email-errors"
        >
        <ul
          id="paraglide-email-errors"
          class="verific-example__errors"
          aria-live="polite"
          aria-atomic="true"
          :lang="locale"
        >
          <li v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
            {{ error }}
          </li>
        </ul>
      </div>

      <div class="verific-example__actions">
        <button type="submit" :disabled="isValidating">
          {{ isValidating ? 'Validating…' : 'Validate with Paraglide' }}
        </button>
        <button
          type="button"
          :aria-pressed="demonstrateMissing"
          aria-controls="paraglide-missing-diagnostic"
          @click="toggleMissingDemonstration"
        >
          Demonstrate missing-key fallback
        </button>
      </div>

      <p
        v-show="missingDiagnostic"
        id="paraglide-missing-diagnostic"
        class="verific-example__outcome"
        role="status"
        aria-live="polite"
      >
        {{ missingDiagnostic }}
      </p>

      <p class="verific-example__outcome" role="status" aria-live="polite">
        {{ visibleOutcome }}
      </p>
    </form>
  </div>
</template>
