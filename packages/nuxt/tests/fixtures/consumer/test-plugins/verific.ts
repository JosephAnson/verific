import { createVerific } from '@verific/core'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(createVerific())
})
