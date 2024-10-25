import type { UnionToIntersection } from 'type-fest'
import type { ComputedRef, MaybeRef, Ref } from 'vue'
import type { z, ZodType } from 'zod'
import { createInjectionState, tryOnScopeDispose, whenever } from '@vueuse/core'
import { computed, inject, ref, unref, watch } from 'vue'
import { VERIFIC_SYMBOL } from './utils/constants'

type recursiveZodFormattedError<T> = T extends [any, ...any[]] ? {
  [K in keyof T]?: ZodFormattedError<T[K]>;
} : T extends any[] ? {
  [k: number]: ZodFormattedError<T[number]>
} : T extends object ? {
  [K in keyof T]?: ZodFormattedError<T[K]> ;
} : unknown

type ZodFormattedError<T, U = string> = {
  _errors: U[]
} & UnionToIntersection<recursiveZodFormattedError<NonNullable<T>>>

const [createValidationScope, _useValidate] = createInjectionState(<Data>() => {
  const rootVerific = inject(VERIFIC_SYMBOL)
  if (!rootVerific) {
    throw new Error(
      'Please call app.useVerific() to initialise Verific',
    )
  }

  const showingErrorsTriggerCount = ref(0)
  const errors = ref({}) as Ref<Record<string, ZodFormattedError<Data>>>
  const validations = ref({}) as Ref<Record<string, { schema: MaybeRef<z.Schema<Data>>, data: Record<keyof Data, Ref<any>> }>>
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
        return [key, unref(validation.schema).safeParse(plainData)]
      }),
    )

    // Extract and format the errors from the parsed results
    const validationErrors = Object.fromEntries(
      Object.entries(parsedResults)
        .filter(([_, value]) => value && !value.success)
        .map(([key, value]) => [
          key,
          rootVerific?.options.useKeysOverStrings
            ? (value as z.SafeParseError<any>).error.format(issue => issue.code === 'custom' ? issue.message : issue.code)
            : (value as z.SafeParseError<any>).error.format(issue => issue.message),
        ]),
    ) as Record<string, ZodFormattedError<Data>>

    // Update the reactive errors object
    errors.value = validationErrors

    // Check if there are any errors in the validation results
    const hasValidationErrors = Object.keys(validationErrors).length > 0 || hasFieldErrors.value

    return {
      success: !hasValidationErrors,
      errors: validationErrors,
    }
  }

  function addValidation(key: string, schema: MaybeRef<z.Schema<Data>>, data: Record<keyof Data, Ref<any>>) {
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

function useValidate<Data>(schema?: MaybeRef<ZodType<Data>>, data?: Record<keyof Data, Ref<any>>) {
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
  }) as ComputedRef<ZodFormattedError<Data>>

  tryOnScopeDispose(() => {
    validateStore.removeValidation(id)
  })

  return { ...validateStore, errors }
}

export { createValidationScope, useValidate }
