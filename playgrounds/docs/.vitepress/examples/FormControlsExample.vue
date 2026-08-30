<script setup lang="ts">
import { useValidation } from '@verific/core'
import { computed, ref } from 'vue'
import { z } from 'zod'

const ageValue = z.union([z.literal(''), z.number()])
  .refine((value): boolean => value !== '', 'Enter your age')
  .refine(
    (value): boolean => value === '' || (Number.isInteger(value) && value >= 18),
    'Enter an age of 18 or older',
  )

const schema = z.object({
  age: ageValue,
  country: z.string().min(1, 'Choose a country'),
  interests: z.array(z.string()).min(1, 'Choose at least one interest'),
})

const age = ref<number | ''>('')
const country = ref('')
const interests = ref<string[]>([])
const readyMessage = 'Submit to validate every field.'
const validMessage = 'The preferences are valid.'
const submissionMessage = ref(readyMessage)
const { errorsFor, hasError, state, touch, validate, validateAt } = useValidation(schema, {
  age,
  country,
  interests,
})
const visibleSubmissionMessage = computed(() => (
  state.value.stale
    ? 'The preferences changed after validation. Validate again.'
    : submissionMessage.value
))

async function onAgeBlur() {
  submissionMessage.value = readyMessage
  touch('age')
  await validateAt('age')
}

async function onCountryChange(event: Event) {
  country.value = (event.currentTarget as HTMLSelectElement).value
  submissionMessage.value = readyMessage
  touch('country')
  await validateAt('country')
}

async function onInterestChange(event: Event) {
  const control = event.currentTarget as HTMLInputElement
  const nextInterests = new Set(interests.value)

  if (control.checked)
    nextInterests.add(control.value)
  else
    nextInterests.delete(control.value)

  interests.value = [...nextInterests]
  submissionMessage.value = readyMessage
  touch('interests')
  await validateAt('interests')
}

async function onSubmit() {
  const result = await validate()

  if (!result.success) {
    const issueCount = result.issues.length
    submissionMessage.value = `Please resolve ${issueCount} validation ${issueCount === 1 ? 'error' : 'errors'}.`

    const firstField = result.issues[0]?.path[0]
    const controlId = firstField === 'age'
      ? 'controls-age'
      : firstField === 'country'
        ? 'controls-country'
        : firstField === 'interests'
          ? 'controls-interest-design'
          : undefined

    if (controlId)
      document.getElementById(controlId)?.focus()
    return
  }

  if (!state.value.validated || state.value.stale) {
    submissionMessage.value = 'The preferences changed during validation. Validate again.'
    return
  }

  submissionMessage.value = validMessage
}
</script>

<template>
  <div class="verific-example">
    <form novalidate aria-describedby="controls-required-instructions" @submit.prevent="onSubmit">
      <p id="controls-required-instructions" class="verific-example__required">
        Age, country and at least one interest are required.
      </p>
      <div class="verific-example__grid">
        <div class="verific-example__field">
          <label for="controls-age">Age</label>
          <input
            id="controls-age"
            v-model.number="age"
            type="number"
            inputmode="numeric"
            min="18"
            step="1"
            required
            :aria-invalid="hasError('age')"
            aria-describedby="controls-age-errors"
            @blur="onAgeBlur"
          >
          <ul id="controls-age-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
            <li v-for="(error, index) in errorsFor('age')" :key="`${index}:${error}`">
              {{ error }}
            </li>
          </ul>
        </div>

        <div class="verific-example__field">
          <label for="controls-country">Country</label>
          <select
            id="controls-country"
            :value="country"
            required
            :aria-invalid="hasError('country')"
            aria-describedby="controls-country-errors"
            @change="onCountryChange"
          >
            <option value="">
              Choose a country
            </option>
            <option value="gb">
              United Kingdom
            </option>
            <option value="es">
              Spain
            </option>
          </select>
          <ul id="controls-country-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
            <li v-for="(error, index) in errorsFor('country')" :key="`${index}:${error}`">
              {{ error }}
            </li>
          </ul>
        </div>
      </div>

      <fieldset
        class="verific-example__field verific-example__choice-group"
        data-validation-required-group
        :aria-invalid="hasError('interests')"
        aria-describedby="controls-interests-requirement controls-interests-errors"
      >
        <legend>Interests (choose at least one — required)</legend>
        <p id="controls-interests-requirement" class="verific-example__hint">
          Choose at least one interest (required).
        </p>
        <div class="verific-example__choices">
          <label class="verific-example__toggle" for="controls-interest-design">
            <input
              id="controls-interest-design"
              type="checkbox"
              value="design"
              :checked="interests.includes('design')"
              :aria-invalid="hasError('interests')"
              aria-describedby="controls-interests-requirement controls-interests-errors"
              @change="onInterestChange"
            >
            Design
          </label>
          <label class="verific-example__toggle" for="controls-interest-testing">
            <input
              id="controls-interest-testing"
              type="checkbox"
              value="testing"
              :checked="interests.includes('testing')"
              :aria-invalid="hasError('interests')"
              aria-describedby="controls-interests-requirement controls-interests-errors"
              @change="onInterestChange"
            >
            Testing
          </label>
        </div>
        <ul id="controls-interests-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
          <li v-for="(error, index) in errorsFor('interests')" :key="`${index}:${error}`">
            {{ error }}
          </li>
        </ul>
      </fieldset>

      <div class="verific-example__actions">
        <button type="submit">
          Validate preferences
        </button>
      </div>

      <p class="verific-example__outcome" role="status" aria-live="polite">
        {{ visibleSubmissionMessage }}
      </p>
    </form>
  </div>
</template>
