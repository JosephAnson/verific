<script setup lang="ts">
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { createValidationScope, ErrorMessages, useValidate } from '@verific/core'
import * as v from 'valibot'
import { computed, ref } from 'vue'
import { z } from 'zod'
import { type } from 'arktype'

// Create a validation scope
const { validate } = createValidationScope()

// Define form data
const name = ref('')
const email = ref('')
const age = ref<number | undefined>(undefined)
const message = ref('')

// Define schemas using different validation libraries
// Zod schema
const zodSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50, 'Name is too long'),
  email: z.string().email('Please enter a valid email address'),
  age: z.number().min(18, 'You must be at least 18 years old'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
})

// Valibot schema
const valibotSchema = v.object({
  name: v.pipe(v.string(), v.minLength(2, 'Name must be at least 2 characters'), v.maxLength(50, 'Name is too long')),
  email: v.pipe(v.string(), v.email('Please enter a valid email address')),
  age: v.pipe(v.number(), v.minValue(18, 'You must be at least 18 years old')),
  message: v.pipe(v.string(), v.minLength(10, 'Message must be at least 10 characters')),
})

// ArkType schema
const arktypeSchema = type({
  name: "'string > 2 < 50'",
  email: "'string.email'",
  age: 'number >= 18',
  message: 'string > 10'
})

// Choose which schema to use (can be toggled)
const schemaType = ref<'zod' | 'valibot' | 'arktype'>('zod')

// Convert to computed property that returns the active schema based on schemaType
const activeSchema = computed(() => {
  const schemaMap: Record<string, StandardSchemaV1> = {
    zod: zodSchema,
    valibot: valibotSchema,
    arktype: arktypeSchema,
  }

  return schemaMap[schemaType.value]
})

// Use validation with the active schema
const { errors } = useValidate(activeSchema, {
  name,
  email,
  age,
  message,
})

// Handle form submission
async function onSubmit(event: Event) {
  event.preventDefault()
  const result = await validate()
  if (!result.success) {
    return
  }
  // eslint-disable-next-line no-console
  console.log({
    title: 'Success',
    description: 'The form has been submitted.',
    data: { 
      name: name.value, 
      email: email.value, 
      age: age.value, 
      message: message.value 
    },
  })
}

// Helper function to get field errors
function getFieldErrors(field: string): Record<string, boolean> {
  if (schemaType.value === 'zod') {
    // Handle Zod error format
    const fieldErrors = (errors.value as any)[field]?._errors || []
    return fieldErrors.reduce((acc: Record<string, boolean>, msg: string) => {
      acc[msg] = true
      return acc
    }, {})
  } else {
    // For valibot, the errors structure is different with the Standard Schema interface
    const issues = (errors.value as unknown as StandardSchemaV1.FailureResult).issues || []
    return issues
      .filter(issue => issue.path?.[0] === field)
      .reduce((acc: Record<string, boolean>, issue: StandardSchemaV1.Issue) => {
        acc[issue.message] = true
        return acc
      }, {})
  }
}

// Helper function to check if a field has errors
function hasFieldErrors(field: string): boolean {
  if (schemaType.value === 'zod') {
    // Handle Zod error format
    return !!(errors.value as any)[field]?._errors?.length
  } else {
    const issues = (errors.value as unknown as StandardSchemaV1.FailureResult).issues || []
    return issues.some(issue => issue.path?.[0] === field)
  }
}
</script>

<template>
  <UContainer class="p-20">
    <h1 class="text-2xl font-bold mb-6">
      Standard Schema Validation Example
    </h1>

    <div class="mb-6">
      <p class="mb-2">
        This example demonstrates how Verific works with any validation library that implements the Standard Schema interface.
      </p>
      <div class="flex items-center space-x-4">
        <span>Current validation library:</span>
        <UButtonGroup>
          <UButton 
            :color="schemaType === 'zod' ? 'primary' : 'gray'" 
            @click="schemaType = 'zod'"
          >
            Zod
          </UButton>
          <UButton 
            :color="schemaType === 'valibot' ? 'primary' : 'gray'" 
            @click="schemaType = 'valibot'"
          >
            Valibot
          </UButton>
          <UButton 
            :color="schemaType === 'arktype' ? 'primary' : 'gray'" 
            @click="schemaType = 'arktype'"
          >
            ArkType
          </UButton>
        </UButtonGroup>
      </div>
    </div>

    <form class="space-y-4" @submit="onSubmit">
      <UFormGroup
        label="Name"
        name="name"
        :error="hasFieldErrors('name')"
      >
        <UInput v-model="name" type="text" />
        <div class="space-y-1 mt-2">
          <ErrorMessages
            :messages="getFieldErrors('name')"
            class="w-full text-sm block text-red-400"
          />
        </div>
      </UFormGroup>

      <UFormGroup
        label="Email"
        name="email"
        :error="hasFieldErrors('email')"
      >
        <UInput v-model="email" type="email" />
        <div class="space-y-1 mt-2">
          <ErrorMessages
            :messages="getFieldErrors('email')"
            class="w-full text-sm block text-red-400"
          />
        </div>
      </UFormGroup>

      <UFormGroup
        label="Age"
        name="age"
        :error="hasFieldErrors('age')"
      >
        <UInput v-model="age" type="number" />
        <div class="space-y-1 mt-2">
          <ErrorMessages
            :messages="getFieldErrors('age')"
            class="w-full text-sm block text-red-400"
          />
        </div>
      </UFormGroup>

      <UFormGroup
        label="Message"
        name="message"
        :error="hasFieldErrors('message')"
      >
        <UTextarea v-model="message" />
        <div class="space-y-1 mt-2">
          <ErrorMessages
            :messages="getFieldErrors('message')"
            class="w-full text-sm block text-red-400"
          />
        </div>
      </UFormGroup>

      <UButton type="submit" class="mt-6">
        Submit
      </UButton>
    </form>

    <div class="mt-8 p-4 bg-gray-100 rounded">
      <h2 class="text-lg font-semibold mb-2">
        Validation Errors:
      </h2>
      <pre class="text-sm">{{ errors }}</pre>
    </div>
  </UContainer>
</template> 