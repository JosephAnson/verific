import { defineNuxtPlugin } from '#app'
import { installVerific } from './install'

export default defineNuxtPlugin({
  name: 'verific:plugin',
  order: 20,
  setup(nuxtApp) {
    installVerific(nuxtApp)
  },
})
