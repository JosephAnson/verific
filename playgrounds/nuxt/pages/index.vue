<script setup lang="ts">
const { errors, isValidating, validate } = useValidation({ messagePrefix: 'forms.signup' })

async function onSubmit() {
  await validate()
}
</script>

<template>
  <UContainer class="p-20">
    <h1 class="text-2xl font-bold mb-2">
      Nested Zod validation
    </h1>
    <p class="mb-6">
      Change locale after validating: the messages update without running the schema again.
    </p>

    <form class="space-y-4" @submit.prevent="onSubmit">
      <SignupFields />
      <UButton type="submit" :loading="isValidating">
        Submit
      </UButton>
    </form>

    <section v-if="errors.length" aria-labelledby="form-error-summary" class="mt-6 text-red-500">
      <h2 id="form-error-summary" class="font-bold">
        Form error summary
      </h2>
      <ul>
        <li v-for="(error, index) in errors" :key="`${index}:${error}`">
          {{ error }}
        </li>
      </ul>
    </section>
  </UContainer>
</template>
