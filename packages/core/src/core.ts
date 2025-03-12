import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ComputedRef, MaybeRef, Ref } from 'vue'
import { createInjectionState, tryOnScopeDispose, whenever } from '@vueuse/core'
import { computed, inject, ref, unref, watch } from 'vue'
import { VERIFIC_SYMBOL } from './utils/constants'
import { unwrapSchema } from './utils/schemaUtils'

const [createValidationScope, _useValidate] = createInjectionState(<T extends StandardSchemaV1>() => {
  const rootVerific = inject(VERIFIC_SYMBOL)
  if (!rootVerific) {
    throw new Error(
      'Please call app.useVerific() to initialise Verific',
    )
  }

  const showingErrorsTriggerCount = ref(0)
  const errors = ref({}) as Ref<Record<string, StandardSchemaV1.FailureResult>>
  const validations = ref({}) as Ref<Record<string, { schema: MaybeRef<StandardSchemaV1>, data: Record<keyof StandardSchemaV1.InferInput<T>, Ref<any>> }>>
  const fieldErrors: Ref<Record<string, Ref<string[]>>> = ref({}) // Used to catch any field errors

  const hasFieldErrors = computed(() => Object.values(fieldErrors.value).some(error => !!error.value?.length))

  whenever(() => showingErrorsTriggerCount.value, validationCheck)

  function showErrors() {
    showingErrorsTriggerCount.value += 1
  }

  function validationCheck() {
    // Transform the validations into parsed results using the provided schema
    const parsedResults = Object.fromEntries(
      Object.entries(validations.value).map(([key, validation]) => {
        const plainData = Object.fromEntries(
          Object.entries(validation.data).map(([dataKey, dataValue]) => [dataKey, unref(dataValue)]),
        )
        // Use the standard schema validate method with the unwrapped schema
        const schema = unwrapSchema(validation.schema)
        return [key, schema['~standard'].validate(plainData)]
      }),
    )

    // Extract and format the errors from the parsed results
    const validationErrors = Object.fromEntries(
      Object.entries(parsedResults)
        .filter(([_, value]) => value && 'issues' in value)
        .map(([key, value]) => [
          key,
          { issues: (value as StandardSchemaV1.FailureResult).issues },
        ]),
    ) as Record<string, StandardSchemaV1.FailureResult>

    // Update the reactive errors object
    errors.value = validationErrors

    // Check if there are any errors in the validation results
    const hasValidationErrors = Object.keys(validationErrors).length > 0 || hasFieldErrors.value

    return {
      success: !hasValidationErrors,
      errors: validationErrors,
    }
  }

  function addValidation<T extends StandardSchemaV1>(key: string, schema: MaybeRef<StandardSchemaV1>, data: Record<keyof StandardSchemaV1.InferInput<T>, Ref<any>>) {
    validations.value[key] = { schema, data }
  }

  function removeValidation(key: string) {
    delete validations.value[key]
  }

  async function validate() {
    showErrors()
    return validationCheck()
  }

  function useSubmit(validateCalled: () => void) {
    watch(() => showingErrorsTriggerCount.value, validateCalled)
  }

 

  return {
    errors,
    fieldErrors,
    validations,
    showingErrorsTriggerCount,
    validate,
    addValidation,
    removeValidation,
    showErrors,
    useSubmit,
  }
})

let counter = 0

function useValidate<T extends StandardSchemaV1>(schema?: MaybeRef<T>, data?: Record<keyof StandardSchemaV1.InferInput<T>, Ref<any>>) {
  const id = `${counter++}`
  const validateStore = _useValidate()
  if (validateStore == null) {
    throw new Error(
      'Please call `useProvideValidate` on the page component',
    )
  }

  if (id && schema && data) {
    validateStore.addValidation(id, schema, data)
  }

  const errors = computed(() => {
    if (!id || !(id in validateStore.errors.value)) {
      return {}
    }

    return validateStore.errors.value[id]
  }) as ComputedRef<StandardSchemaV1.FailureResult>

  tryOnScopeDispose(() => {
    validateStore.removeValidation(id)
  })

  return { ...validateStore, errors, getTypes }
}

export { createValidationScope, useValidate }
