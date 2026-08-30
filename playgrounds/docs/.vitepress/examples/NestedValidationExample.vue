<script setup lang="ts">
import { useValidation } from '@verific/core'
import { computed, nextTick, ref } from 'vue'
import NestedNameField from './NestedNameField.vue'
import NestedPhoneField from './NestedPhoneField.vue'

const includePhone = ref(true)
const hasValidated = ref(false)
const { isValidating, issues, state, validate } = useValidation()

const outcome = computed(() => {
  if (!hasValidated.value) {
    return 'Submit the parent form to validate every mounted field.'
  }

  if (state.value.stale) {
    return 'The parent form changed after validation. Validate again.'
  }

  const count = issues.value.length
  if (count === 0) {
    return 'No committed errors remain in the parent scope.'
  }

  return `${count} committed ${count === 1 ? 'error is' : 'errors are'} in the parent scope.`
})

async function onSubmit() {
  const result = await validate()
  hasValidated.value = true
  if (!result.success) {
    await nextTick()
    const firstField = result.issues[0]?.path[0]
    if (firstField === 'name' || firstField === 'phone') {
      document.getElementById(`nested-${firstField}`)?.focus()
    }
  }
}
</script>

<template>
  <div class="verific-example">
    <form
      novalidate
      aria-describedby="nested-required-instructions"
      @submit.prevent="onSubmit"
    >
      <p id="nested-required-instructions" class="verific-example__required">
        Name is required. Phone number is required while its optional section is included.
      </p>
      <fieldset>
        <legend>Profile fields registered by descendants</legend>
        <div class="verific-example__grid">
          <NestedNameField />
          <NestedPhoneField v-if="includePhone" />
        </div>
      </fieldset>

      <label class="verific-example__toggle">
        <input v-model="includePhone" type="checkbox" data-validation-skip>
        Include the optional phone component
      </label>

      <div class="verific-example__actions">
        <button type="submit" :disabled="isValidating">
          {{ isValidating ? 'Validating…' : 'Validate parent form' }}
        </button>
      </div>

      <p class="verific-example__outcome" role="status" aria-live="polite">
        {{ outcome }}
      </p>
    </form>
  </div>
</template>
