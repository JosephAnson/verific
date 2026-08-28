<script setup lang="ts">
import { vueI18nMessages } from '@verific/vue-i18n'
import * as v from 'valibot'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const schema = v.object({
  name: v.pipe(v.string(), v.minLength(2, 'Name must be at least 2 characters')),
  email: v.pipe(v.string(), v.email('Enter a valid email address')),
  age: v.pipe(v.number(), v.minValue(18, 'You must be at least 18 years old')),
  website: v.optional(v.pipe(v.string(), v.url('Enter a valid URL'))),
})

const name = ref('')
const email = ref('')
const age = ref<number | undefined>()
const website = ref<string | undefined>()

const composer = useI18n({
  useScope: 'local',
  messages: {
    en: { forms: { profile: { name: { minLength: 'Tell us your full name' } } } },
    es: { forms: { profile: { name: { minLength: 'Escribe tu nombre completo' } } } },
  },
})
composer.fallbackRoot = false

const { errorFor, errorsFor, validate } = useValidation(schema, {
  name,
  email,
  age,
  website,
}, {
  messagePrefix: 'forms.profile',
  messages: vueI18nMessages(composer),
})

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
    <h1 class="text-2xl font-bold mb-6">
      Valibot validation
    </h1>

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

      <UFormField label="Website" name="website" :error="errorFor('website')">
        <UInput v-model="website" type="url" />
        <template #error>
          <p v-for="(error, index) in errorsFor('website')" :key="`${index}:${error}`">
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
