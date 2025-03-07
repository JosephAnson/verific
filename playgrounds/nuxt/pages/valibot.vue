<script setup lang="ts">
import { createValidationScope, ErrorMessages, useValidate } from '@verific/core'
import * as v from 'valibot'
import { ref } from 'vue'

// Create a valibot schema
const valibotSchema = v.object({
  name: v.pipe(v.string(), v.minLength(2, 'Name must be at least 2 characters'), v.maxLength(50, 'Name is too long')),
  email: v.pipe(v.string(), v.email('Please enter a valid email address')),
  age: v.pipe(v.number(), v.minValue(18, 'You must be at least 18 years old')),
  website: v.optional(v.pipe(v.string(), v.url('Please enter a valid URL'))),
})

// Create refs for form fields
const name = ref('')
const email = ref('')
const age = ref<number | null>(null)
const website = ref('')

// Set up validation
const { validate } = createValidationScope()
const { errors } = useValidate(valibotSchema, {
  name,
  email,
  age,
  website,
})

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
    data: { name: name.value, email: email.value, age: age.value, website: website.value },
  })
}
</script>

<template>
  <UContainer class="p-20">
    <h1 class="text-2xl font-bold mb-6">
      Valibot Validation Example
    </h1>

    <form class="space-y-4" @submit="onSubmit">
      <UFormGroup
        label="Name"
        name="name"
        :error="!!errors.name?._errors?.length"
      >
        <UInput v-model="name" type="text" />
        <div class="space-y-1 mt-2">
          <ErrorMessages
            :messages="errors.name?._errors?.reduce((acc, msg) => ({ ...acc, [msg]: true }), {}) || {}"
            class="w-full text-sm block text-red-400"
          />
        </div>
      </UFormGroup>

      <UFormGroup
        label="Email"
        name="email"
        :error="!!errors.email?._errors?.length"
      >
        <UInput v-model="email" type="email" />
        <div class="space-y-1 mt-2">
          <ErrorMessages
            :messages="errors.email?._errors?.reduce((acc, msg) => ({ ...acc, [msg]: true }), {}) || {}"
            class="w-full text-sm block text-red-400"
          />
        </div>
      </UFormGroup>

      <UFormGroup
        label="Age"
        name="age"
        :error="!!errors.age?._errors?.length"
      >
        <UInput v-model="age" type="number" />
        <div class="space-y-1 mt-2">
          <ErrorMessages
            :messages="errors.age?._errors?.reduce((acc, msg) => ({ ...acc, [msg]: true }), {}) || {}"
            class="w-full text-sm block text-red-400"
          />
        </div>
      </UFormGroup>

      <UFormGroup
        label="Website (optional)"
        name="website"
        :error="!!errors.website?._errors?.length"
      >
        <UInput v-model="website" type="url" />
        <div class="space-y-1 mt-2">
          <ErrorMessages
            :messages="errors.website?._errors?.reduce((acc, msg) => ({ ...acc, [msg]: true }), {}) || {}"
            class="w-full text-sm block text-red-400"
          />
        </div>
      </UFormGroup>

      <UButton type="submit" class="mt-6">
        Submit
      </UButton>
    </form>

    <div class="mt-8 p-4 bg-gray-900 rounded">
      <h2 class="text-lg font-semibold mb-2">
        Validation Errors:
      </h2>
      <pre class="text-sm">{{ errors }}</pre>
    </div>
  </UContainer>
</template>
