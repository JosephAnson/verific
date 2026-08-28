<script setup lang="ts">
import type { StandardSchemaV1 } from '@standard-schema/spec'
import * as v from 'valibot'
import { computed, ref } from 'vue'
import { z } from 'zod'

interface ContactForm {
  name: string
  email: string
  age: number
  message: string
}

const zodSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email address'),
  age: z.number().min(18, 'You must be at least 18 years old'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
})

const valibotSchema = v.object({
  name: v.pipe(v.string(), v.minLength(2, 'Name must be at least 2 characters')),
  email: v.pipe(v.string(), v.email('Enter a valid email address')),
  age: v.pipe(v.number(), v.minValue(18, 'You must be at least 18 years old')),
  message: v.pipe(v.string(), v.minLength(10, 'Message must be at least 10 characters')),
})

const schemaType = ref<'zod' | 'valibot'>('zod')
const schema = computed<StandardSchemaV1<ContactForm>>(() => (
  schemaType.value === 'zod' ? zodSchema : valibotSchema
))

const name = ref('')
const email = ref('')
const age = ref<number | undefined>()
const message = ref('')

const { errorFor, errorsFor, validate } = useValidation(schema, {
  name,
  email,
  age,
  message,
}, { messagePrefix: 'forms.contact' })

async function onSubmit() {
  const result = await validate()
  if (!result.success) {
    return
  }

  // eslint-disable-next-line no-console
  console.log('Form submitted', { name: name.value, email: email.value })
}
</script>

<template>
  <UContainer class="p-20">
    <h1 class="text-2xl font-bold mb-2">
      Standard Schema validation
    </h1>
    <p class="mb-6">
      The same form can switch between Standard Schema-compatible validators.
    </p>

    <UFieldGroup class="mb-6">
      <UButton :color="schemaType === 'zod' ? 'primary' : 'neutral'" @click="schemaType = 'zod'">
        Zod
      </UButton>
      <UButton :color="schemaType === 'valibot' ? 'primary' : 'neutral'" @click="schemaType = 'valibot'">
        Valibot
      </UButton>
    </UFieldGroup>

    <form class="space-y-4" @submit.prevent="onSubmit">
      <UFormField label="Name" name="name" :error="errorFor('name')">
        <UInput v-model="name" />
        <template #error>
          <p v-for="(error, index) in errorsFor('name')" :key="`${index}:${error}`">
            {{ error }}
          </p>
        </template>
      </UFormField>

      <UFormField label="Email" name="email" :error="errorFor('email')">
        <UInput v-model="email" type="email" />
        <template #error>
          <p v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
            {{ error }}
          </p>
        </template>
      </UFormField>

      <UFormField label="Age" name="age" :error="errorFor('age')">
        <UInput v-model="age" type="number" />
        <template #error>
          <p v-for="(error, index) in errorsFor('age')" :key="`${index}:${error}`">
            {{ error }}
          </p>
        </template>
      </UFormField>

      <UFormField label="Message" name="message" :error="errorFor('message')">
        <UTextarea v-model="message" />
        <template #error>
          <p v-for="(error, index) in errorsFor('message')" :key="`${index}:${error}`">
            {{ error }}
          </p>
        </template>
      </UFormField>

      <UButton type="submit">
        Submit
      </UButton>
    </form>
  </UContainer>
</template>
