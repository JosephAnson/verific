<script setup lang="ts">
import type { CatalogueMissingMessageDiagnostic } from '@verific/i18n'
import { useValidation } from '@verific/core'
import { i18nextMessages } from '@verific/i18next'
import { createInstance } from 'i18next'
import { computed, nextTick, onUnmounted, ref } from 'vue'
import { z } from 'zod'

const i18n = createInstance()
void i18n.init({
  fallbackLng: false,
  initAsync: false,
  lng: 'en',
  resources: {
    en: { translation: { errors: { invalidEmail: 'Enter a valid email address' } } },
    es: { translation: { errors: { invalidEmail: 'Introduce una dirección de correo válida' } } },
  },
})

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
const messages = i18nextMessages(i18n, {
  fallbackPrefix: 'errors',
  key: ({ defaultKeys }) => demonstrateMissing.value
    ? [`demo.missing.${missingSequence.value}`]
    : defaultKeys,
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

onUnmounted(messages.dispose)

async function onSubmit() {
  const result = await validate()
  if (!result.success) {
    outcome.value = 'The committed error is translated when the locale changes.'
    await nextTick()
    document.getElementById('i18next-email')?.focus()
    return
  }

  outcome.value = state.value.validated && !state.value.stale
    ? 'The email address is valid.'
    : 'The email address changed during validation. Validate again.'
}

async function changeLocale() {
  await i18n.changeLanguage(locale.value)
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
    <form novalidate aria-describedby="i18next-demo-required-instructions" @submit.prevent="onSubmit">
      <p id="i18next-demo-required-instructions" class="verific-example__required">
        Email is required.
      </p>
      <div class="verific-example__toolbar">
        <div class="verific-example__field">
          <label for="i18next-locale">Message language</label>
          <select id="i18next-locale" v-model="locale" data-validation-skip @change="changeLocale">
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
        <label for="i18next-email">Email address</label>
        <input
          id="i18next-email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          :aria-invalid="hasError('email')"
          aria-describedby="i18next-email-errors"
        >
        <ul
          id="i18next-email-errors"
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
          {{ isValidating ? 'Validating…' : 'Validate with i18next' }}
        </button>
        <button
          type="button"
          :aria-pressed="demonstrateMissing"
          aria-controls="i18next-missing-diagnostic"
          @click="toggleMissingDemonstration"
        >
          Demonstrate missing-key fallback
        </button>
      </div>

      <p
        v-show="missingDiagnostic"
        id="i18next-missing-diagnostic"
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
