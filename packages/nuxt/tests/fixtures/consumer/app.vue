<script setup lang="ts">
if (import.meta.server) {
  const requestedLocale = useRequestHeaders(['x-verific-locale'])['x-verific-locale']
  const nuxtApp = useNuxtApp()
  if ((requestedLocale === 'en' || requestedLocale === 'nl') && '$i18n' in nuxtApp) {
    const composer = nuxtApp.$i18n as { locale: { value: string } }
    composer.locale.value = requestedLocale

    const requestBarrier = Reflect.get(nuxtApp, '$requestBarrier')
    if (typeof requestBarrier === 'function') {
      await requestBarrier(requestedLocale)
      console.warn(`[Verific test barrier] continued ${requestedLocale}`)
    }
  }
}

const model = reactive({ email: '', diagnostic: '' })
const schema = {
  '~standard': {
    version: 1,
    vendor: 'verific-test',
    validate(value: { email: string, diagnostic: string }) {
      return value.email
        ? { value }
        : {
            issues: [
              { message: 'Email is required', path: ['email'] },
              { message: 'Request-local diagnostic', path: ['diagnostic'] },
            ],
          }
    },
  },
} as const

const validation = useValidation(schema, model, { messagePrefix: 'forms.consumer' })
const result = await validation.validate()
</script>

<template>
  <p id="validation-status">
    {{ result.success ? 'valid' : 'invalid' }}
  </p>
  <p id="validation-message">
    {{ validation.errorFor('email') }}
  </p>
  <p id="diagnostic-message">
    {{ validation.errorFor('diagnostic') }}
  </p>
</template>
