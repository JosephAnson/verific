<script setup lang="ts">
import { useValidation } from '@verific/core'
import { computed, nextTick, reactive } from 'vue'
import { z } from 'zod'

const schema = z.object({
  profile: z.object({
    name: z.string().min(1, 'Enter a name'),
  }),
  email: z.email('Enter a valid email address'),
}).superRefine(async (value, context) => {
  const delay = value.email === 'slow-taken@example.com' ? 1_800 : 200
  await new Promise(resolve => setTimeout(resolve, delay))
  if (value.email.endsWith('taken@example.com')) {
    context.addIssue({
      code: 'custom',
      message: 'Choose another email address',
      path: ['email'],
    })
  }
}).transform(value => ({
  name: value.profile.name.trim(),
  email: value.email.toLowerCase(),
}))

type Submission = z.output<typeof schema>

const model = reactive({
  profile: { name: 'Ada' },
  email: 'ada@example.com',
})
const {
  errorsFor,
  hasError,
  result,
  resetState,
  state,
  stateFor,
  touch,
  validate,
  validateAt,
} = useValidation(schema, model)
const nameState = computed(() => stateFor(['profile', 'name']))
const emailState = computed(() => stateFor('email'))
const submission = computed<Submission | undefined>(() => (
  result.value.status === 'valid'
  && state.value.validated
  && !state.value.stale
)
  ? result.value.value
  : undefined)
function checkedState(fieldState: ReturnType<typeof stateFor>) {
  if (!fieldState.validated)
    return 'Not checked'
  return fieldState.stale ? 'Out of date' : 'Current'
}
const outcome = computed(() => {
  if (state.value.validating)
    return 'Validation is running.'
  if (!state.value.validated)
    return 'The complete form has not been validated.'
  if (state.value.stale)
    return 'The committed result no longer describes the current model.'
  return 'The committed result describes the current model.'
})

async function onNameBlur() {
  touch(['profile', 'name'])
  await ignoreResetAbort(validateAt(['profile', 'name']))
}

async function checkEmail() {
  await ignoreResetAbort(validateAt('email'))
}

function rebaseState() {
  resetState()
}

async function onSubmit() {
  const result = await ignoreResetAbort(validate())
  if (!result)
    return
  if (!result.success) {
    await nextTick()
    for (const issue of result.issues) {
      const key = issue.path.join('.')
      const controlId = key === 'profile.name'
        ? 'state-name'
        : key === 'email'
          ? 'state-email'
          : undefined
      const control = controlId ? document.getElementById(controlId) : undefined
      if (control) {
        control.focus()
        break
      }
    }
  }
}

async function ignoreResetAbort<Value>(work: Promise<Value>): Promise<Value | undefined> {
  try {
    return await work
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      return undefined
    throw error
  }
}
</script>

<template>
  <div class="verific-example">
    <form
      novalidate
      :aria-busy="state.validating"
      aria-describedby="state-required-instructions"
      @submit.prevent="onSubmit"
    >
      <p id="state-required-instructions" class="verific-example__required">
        All fields are required.
      </p>
      <div class="verific-example__grid">
        <div class="verific-example__field">
          <label for="state-name">Profile name</label>
          <input
            id="state-name"
            v-model="model.profile.name"
            type="text"
            autocomplete="name"
            required
            :aria-invalid="hasError(['profile', 'name'])"
            aria-describedby="state-name-errors"
            @blur="onNameBlur"
          >
          <ul id="state-name-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
            <li v-for="(error, index) in errorsFor(['profile', 'name'])" :key="`${index}:${error}`">
              {{ error }}
            </li>
          </ul>
        </div>

        <div class="verific-example__field">
          <label for="state-email">Email address</label>
          <input
            id="state-email"
            v-model="model.email"
            type="email"
            autocomplete="email"
            required
            :aria-busy="emailState.validating"
            :aria-invalid="hasError('email')"
            aria-describedby="state-email-hint state-email-errors"
          >
          <p id="state-email-hint" class="verific-example__hint">
            Use slow-taken@example.com for a 1.8-second check you can interrupt or reset.
          </p>
          <ul id="state-email-errors" class="verific-example__errors" aria-live="polite" aria-atomic="true">
            <li v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
              {{ error }}
            </li>
          </ul>
        </div>
      </div>

      <dl class="verific-example__state" aria-label="Current validation state">
        <div>
          <dt>Model</dt>
          <dd id="state-form-dirty">
            {{ state.dirty ? 'Changed' : 'Clean' }}
          </dd>
        </div>
        <div>
          <dt>Email activity</dt>
          <dd id="state-email-pending">
            {{ emailState.validating ? 'Checking' : 'Idle' }}
          </dd>
        </div>
        <div>
          <dt>Email check</dt>
          <dd id="state-email-stale">
            {{ checkedState(emailState) }}
          </dd>
        </div>
        <div>
          <dt>Name interaction</dt>
          <dd id="state-name-touched">
            {{ nameState.touched ? 'Touched' : 'Untouched' }}
          </dd>
        </div>
        <div>
          <dt>Name check</dt>
          <dd id="state-name-validated">
            {{ checkedState(nameState) }}
          </dd>
        </div>
      </dl>

      <div class="verific-example__actions">
        <button type="submit" :disabled="state.validating">
          Validate and transform
        </button>
        <button type="button" class="verific-example__secondary" @click="checkEmail">
          Check email
        </button>
        <button type="button" class="verific-example__secondary" @click="rebaseState">
          Use current values as baseline
        </button>
      </div>

      <p class="verific-example__outcome" role="status" aria-live="polite">
        {{ outcome }}
      </p>
      <section v-if="submission" aria-labelledby="state-output-title">
        <h3 id="state-output-title" class="verific-example__output-title">
          Current validated output
        </h3>
        <pre id="state-output" class="verific-example__output">{{ JSON.stringify(submission, null, 2) }}</pre>
      </section>
    </form>
  </div>
</template>
