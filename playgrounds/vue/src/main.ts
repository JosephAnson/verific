import Aura from '@primeuix/themes/aura'
import { createVerific } from '@verific/core'
import { vueI18nMessages } from '@verific/vue-i18n'
import PrimeVue from 'primevue/config'
import { createApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n'
import router from './router'
import './assets/main.css'

const app = createApp(App)
const verific = createVerific({
  messages: vueI18nMessages(i18n.global, {
    fallbackPrefix: 'errors',
    missing: 'warn',
  }),
})

app.use(router)
app.use(i18n)
app.use(verific)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
  },
})
app.mount('#app')
