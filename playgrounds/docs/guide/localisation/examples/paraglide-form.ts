import { messageLocale } from './paraglide-setup'

export function changeMessageLanguage() {
  messageLocale.value = messageLocale.value === 'en' ? 'es' : 'en'
}
