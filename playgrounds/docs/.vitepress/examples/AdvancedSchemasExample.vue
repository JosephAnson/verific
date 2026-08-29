<script setup lang="ts">
import type { IssueNormaliser } from '@verific/core'
import { useValidation } from '@verific/core'
import { nextTick, ref } from 'vue'
import { z } from 'zod'

const commonFields = {
  profile: z.object({
    displayName: z.string().min(1, 'Enter a display name'),
  }),
  contacts: z.array(z.object({
    email: z.email('Enter a valid contact email'),
  })).min(1, 'Keep at least one contact'),
  password: z.string().min(8, 'Use at least 8 characters'),
  confirmation: z.string(),
}
const fullValidationCount = ref(0)

const schema = z.discriminatedUnion('kind', [
  z.object({
    ...commonFields,
    kind: z.literal('person'),
    dateOfBirth: z.string().min(1, 'Enter a date of birth'),
  }),
  z.object({
    ...commonFields,
    kind: z.literal('company'),
    companyNumber: z.string().min(1, 'Enter a company number'),
  }),
]).superRefine((value, context) => {
  if (value.password !== value.confirmation) {
    context.addIssue({
      code: 'custom',
      message: 'Passwords must match',
      params: { rule: 'passwordMismatch' },
      path: ['confirmation'],
    })
  }
})

type FormInput = z.input<typeof schema>

const model = ref<FormInput>({
  profile: { displayName: 'Ada' },
  contacts: [{ email: 'ADA@example.com' }],
  password: 'correct-horse',
  confirmation: 'correct-horse',
  kind: 'person',
  dateOfBirth: '1815-12-10',
})
const describeIssue: IssueNormaliser = ({ raw }) => {
  const issue = raw as z.ZodIssue & { params?: { rule?: string } }
  const identifier = issue.params?.rule
  return identifier ? { identifier, values: {} } : undefined
}
const {
  errorsFor,
  hasError,
  state,
  stateFor,
  touch,
  validate,
  validateAt,
} = useValidation(schema, model, { describeIssue })
const announcement = ref('Use full validation after branch or collection structure changes.')

async function runFullValidation() {
  fullValidationCount.value += 1
  return validate()
}

async function onKindChange(event: Event) {
  const kind = (event.currentTarget as HTMLSelectElement).value as FormInput['kind']
  const current = model.value
  model.value = kind === 'person'
    ? {
        profile: current.profile,
        contacts: current.contacts,
        password: current.password,
        confirmation: current.confirmation,
        kind,
        dateOfBirth: '',
      }
    : {
        profile: current.profile,
        contacts: current.contacts,
        password: current.password,
        confirmation: current.confirmation,
        kind,
        companyNumber: '',
      }
  touch('kind')
  await runFullValidation()
  announcement.value = `Validated the active ${kind} branch.`
}

async function addContact() {
  model.value.contacts.push({ email: '' })
  await runFullValidation()
  announcement.value = 'Added a positional row and ran full validation.'
}

async function removeContact(index: number) {
  model.value.contacts.splice(index, 1)
  const validation = runFullValidation()
  await nextTick()
  const adjacentIndex = Math.min(index, model.value.contacts.length - 1)
  const focusTargetId = adjacentIndex >= 0
    ? `advanced-remove-contact-${adjacentIndex}`
    : 'advanced-add-contact'
  document.getElementById(focusTargetId)?.focus()
  await validation
  announcement.value = 'Removed a positional row and ran full validation.'
}

async function onContactBlur(index: number) {
  const path = ['contacts', index, 'email'] as const
  touch(path)
  await validateAt(path)
}

async function onSubmit() {
  const validation = await runFullValidation()
  if (validation.success) {
    announcement.value = 'The active branch and positional rows are valid.'
    return
  }

  announcement.value = `Resolve ${validation.issues.length} validation ${validation.issues.length === 1 ? 'error' : 'errors'}.`
  await nextTick()
  focusFirstIssue(validation.issues.map(issue => issue.path))
}

function focusFirstIssue(paths: readonly (readonly PropertyKey[])[]) {
  for (const path of paths) {
    const key = path.map(String).join('.')
    const controlId = key === 'profile.displayName'
      ? 'advanced-display-name'
      : key.match(/^contacts\.(\d+)\.email$/)?.[1]
        ? `advanced-contact-${key.split('.')[1]}`
        : key === 'contacts'
          ? 'advanced-add-contact'
          : key === 'password'
            ? 'advanced-password'
            : key === 'confirmation'
              ? 'advanced-confirmation'
              : key === 'dateOfBirth'
                ? 'advanced-date-of-birth'
                : key === 'companyNumber'
                  ? 'advanced-company-number'
                  : undefined
    const control = controlId ? document.getElementById(controlId) : undefined
    if (control) {
      control.focus()
      break
    }
  }
}
</script>

<template>
  <div class="verific-example">
    <form
      novalidate
      :aria-busy="state.validating"
      aria-describedby="advanced-required-instructions"
      @submit.prevent="onSubmit"
    >
      <p id="advanced-required-instructions" class="verific-example__required">
        All visible fields are required.
      </p>
      <div class="verific-example__grid">
        <div class="verific-example__field">
          <label for="advanced-display-name">Display name</label>
          <input
            id="advanced-display-name"
            v-model="model.profile.displayName"
            type="text"
            autocomplete="name"
            required
            :aria-invalid="hasError(['profile', 'displayName'])"
            aria-describedby="advanced-display-name-errors"
          >
          <ul id="advanced-display-name-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
            <li v-for="(error, index) in errorsFor(['profile', 'displayName'])" :key="`${index}:${error}`">
              {{ error }}
            </li>
          </ul>
        </div>

        <div class="verific-example__field">
          <label for="advanced-kind">Account kind</label>
          <select
            id="advanced-kind"
            :value="model.kind"
            required
            aria-describedby="advanced-kind-state"
            data-validation-skip
            @change="onKindChange"
          >
            <option value="person">
              Person
            </option>
            <option value="company">
              Company
            </option>
          </select>
          <p id="advanced-kind-state" class="verific-example__hint">
            {{ stateFor('kind').touched ? 'Touched' : 'Untouched' }}
          </p>
        </div>
      </div>

      <div v-if="model.kind === 'person'" class="verific-example__field">
        <label for="advanced-date-of-birth">Date of birth</label>
        <input
          id="advanced-date-of-birth"
          v-model="model.dateOfBirth"
          type="date"
          required
          :aria-invalid="hasError('dateOfBirth')"
          aria-describedby="advanced-date-of-birth-errors"
        >
        <ul id="advanced-date-of-birth-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
          <li v-for="(error, index) in errorsFor('dateOfBirth')" :key="`${index}:${error}`">
            {{ error }}
          </li>
        </ul>
      </div>

      <div v-else class="verific-example__field">
        <label for="advanced-company-number">Company number</label>
        <input
          id="advanced-company-number"
          v-model="model.companyNumber"
          type="text"
          required
          :aria-invalid="hasError('companyNumber')"
          aria-describedby="advanced-company-number-errors"
        >
        <ul id="advanced-company-number-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
          <li v-for="(error, index) in errorsFor('companyNumber')" :key="`${index}:${error}`">
            {{ error }}
          </li>
        </ul>
      </div>

      <fieldset class="verific-example__collection" aria-describedby="advanced-contacts-errors">
        <legend>Contact emails</legend>
        <div v-for="(contact, index) in model.contacts" :key="index" class="verific-example__collection-row">
          <div class="verific-example__field">
            <label :for="`advanced-contact-${index}`">Contact {{ index + 1 }} email</label>
            <input
              :id="`advanced-contact-${index}`"
              v-model="contact.email"
              type="email"
              autocomplete="email"
              required
              :aria-invalid="hasError(['contacts', index, 'email'])"
              :aria-describedby="`advanced-contact-${index}-errors advanced-contact-${index}-state`"
              @blur="onContactBlur(index)"
            >
            <ul
              :id="`advanced-contact-${index}-errors`"
              class="verific-example__errors"
              aria-live="polite"
              aria-atomic="true"
            >
              <li v-for="(error, errorIndex) in errorsFor(['contacts', index, 'email'])" :key="`${errorIndex}:${error}`">
                {{ error }}
              </li>
            </ul>
            <p :id="`advanced-contact-${index}-state`" class="verific-example__hint">
              {{ stateFor(['contacts', index, 'email']).touched ? 'Touched' : 'Untouched' }}
            </p>
          </div>
          <button
            :id="`advanced-remove-contact-${index}`"
            type="button"
            class="verific-example__secondary"
            @click="removeContact(index)"
          >
            Remove contact {{ index + 1 }}
          </button>
        </div>
        <button
          id="advanced-add-contact"
          type="button"
          class="verific-example__secondary"
          aria-describedby="advanced-contacts-errors"
          @click="addContact"
        >
          Add blank contact
        </button>
        <ul id="advanced-contacts-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
          <li v-for="(error, index) in errorsFor('contacts')" :key="`${index}:${error}`">
            {{ error }}
          </li>
        </ul>
      </fieldset>

      <div class="verific-example__grid">
        <div class="verific-example__field">
          <label for="advanced-password">Password</label>
          <input
            id="advanced-password"
            v-model="model.password"
            type="password"
            autocomplete="new-password"
            required
            :aria-invalid="hasError('password')"
            aria-describedby="advanced-password-errors"
          >
          <ul id="advanced-password-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
            <li v-for="(error, index) in errorsFor('password')" :key="`${index}:${error}`">
              {{ error }}
            </li>
          </ul>
        </div>
        <div class="verific-example__field">
          <label for="advanced-confirmation">Confirm password</label>
          <input
            id="advanced-confirmation"
            v-model="model.confirmation"
            type="password"
            autocomplete="new-password"
            required
            :aria-invalid="hasError('confirmation')"
            aria-describedby="advanced-confirmation-errors"
          >
          <ul id="advanced-confirmation-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
            <li v-for="(error, index) in errorsFor('confirmation')" :key="`${index}:${error}`">
              {{ error }}
            </li>
          </ul>
        </div>
      </div>

      <div class="verific-example__actions">
        <button type="submit" :disabled="state.validating">
          Validate advanced form
        </button>
      </div>

      <p class="verific-example__counter">
        Full validations requested: <strong>{{ fullValidationCount }}</strong>
      </p>
      <p class="verific-example__outcome" role="status" aria-live="polite">
        {{ announcement }}
      </p>
    </form>
  </div>
</template>
