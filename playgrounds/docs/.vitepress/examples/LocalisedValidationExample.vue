<script setup lang="ts">
import type { CatalogueMissingMessageDiagnostic } from '@verific/i18n'
import { useValidation } from '@verific/core'
import { vueI18nMessages } from '@verific/vue-i18n'
import { nextTick, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { z } from 'zod'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: false,
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en: { forms: { newsletter: { email: {
      minLength: 'Enter your email address',
      invalidEmail: 'Enter a valid email address',
    } } } },
    es: { forms: { newsletter: { email: {
      minLength: 'Introduce tu dirección de correo electrónico',
      invalidEmail: 'Introduce una dirección de correo electrónico válida',
    } } } },
  },
})

const composer = i18n.global
const locale = composer.locale
const email = ref('not-an-email')
const runCount = ref(0)
const demonstrateMissing = ref(false)
const missingSequence = ref(0)
const missingDiagnostic = ref('')
const schema = z.object({
  email: z.string().min(1).email('Schema fallback: enter a valid email address'),
}).superRefine(() => {
  runCount.value += 1
})
const outcome = ref('Validate once, then change the locale.')
const { errorsFor, isValidating, validate } = useValidation(
  schema,
  { email },
  {
    messagePrefix: 'forms.newsletter',
    messages: vueI18nMessages(composer, {
      key: ({ defaultKeys }) => demonstrateMissing.value
        ? [`demo.missing.${missingSequence.value}`]
        : defaultKeys,
      missing: reportMissing,
    }),
  },
)

async function onSubmit() {
  const result = await validate()
  if (!result.success) {
    outcome.value = 'The committed error is translated when the locale changes.'
    await nextTick()
    document.getElementById('localised-email')?.focus()
    return
  }

  outcome.value = 'The email address is valid.'
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
    <form novalidate @submit.prevent="onSubmit">
      <div class="verific-example__toolbar">
        <div class="verific-example__field">
          <label for="localised-locale">Message language</label>
          <select id="localised-locale" v-model="locale" data-validation-skip>
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
        <label for="localised-email">Email address</label>
        <input
          id="localised-email"
          v-model="email"
          type="email"
          autocomplete="email"
          :aria-invalid="errorsFor('email').length > 0"
          aria-describedby="localised-email-errors"
        >
        <ul id="localised-email-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true" :lang="locale">
          <li v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
            {{ error }}
          </li>
        </ul>
      </div>

      <div class="verific-example__actions">
        <button type="submit" :disabled="isValidating">
          {{ isValidating ? 'Validating…' : 'Validate email' }}
        </button>
        <button
          type="button"
          :aria-pressed="demonstrateMissing"
          aria-controls="localised-missing-diagnostic"
          @click="toggleMissingDemonstration"
        >
          Demonstrate missing-key fallback
        </button>
      </div>

      <p
        v-show="missingDiagnostic"
        id="localised-missing-diagnostic"
        class="verific-example__outcome"
        role="status"
        aria-live="polite"
      >
        {{ missingDiagnostic }}
      </p>

      <p class="verific-example__outcome" role="status" aria-live="polite">
        {{ outcome }}
      </p>
    </form>
  </div>
</template>
