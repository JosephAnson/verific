import { i18n } from '../../localisation/examples/vue-i18n-setup'

export function changeMessageLanguage() {
  const { locale } = i18n.global
  locale.value = locale.value === 'en' ? 'es' : 'en'
}
