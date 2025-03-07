import { defineNuxtPlugin, useRuntimeConfig } from '#app'
import { createVerific } from '@verific/core'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig().public.verific

  // Create Verific instance with config
  const verific = createVerific({
    useKeysOverStrings: config?.config?.useKeysOverStrings || false,
  })

  // Install Verific
  nuxtApp.vueApp.use(verific)

  return {
    provide: {
      verific,
    },
  }
})
