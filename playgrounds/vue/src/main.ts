import Aura from '@primevue/themes/aura'
import { createVerific } from '@verific/core'
import PrimeVue from 'primevue/config'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './assets/main.css'

const app = createApp(App)
const verific = createVerific()

app.use(router)
app.use(verific)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
  },
})
app.mount('#app')
