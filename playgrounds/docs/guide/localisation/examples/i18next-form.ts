import { i18n } from './i18next-setup'

export async function changeMessageLanguage() {
  const nextLocale = i18n.language === 'en' ? 'es' : 'en'
  await i18n.changeLanguage(nextLocale)
}
