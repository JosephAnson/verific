import { defineConfig } from 'vitepress'

const Start = [
  { text: 'Getting started', link: '/guide/' },
  { text: 'Why Verific?', link: '/guide/why' },
]

const CoreConcepts = [
  { text: 'Binding form controls', link: '/guide/core/form-controls' },
  { text: 'Form state', link: '/guide/core/form-state' },
  { text: 'Advanced schemas', link: '/guide/core/advanced-schemas' },
  { text: 'Scopes and registrations', link: '/guide/core/nested-validation' },
  { text: 'Issues and errors', link: '/guide/core/issues-and-errors' },
  { text: 'Submitting validated data', link: '/guide/core/service-layer-to-validation' },
  { text: 'Rendering errors', link: '/guide/components/error-messages' },
]

const Localisation = [
  { text: 'Overview', link: '/guide/localisation' },
  { text: 'Vue I18n', link: '/guide/localisation/vue-i18n' },
  { text: 'i18next', link: '/guide/localisation/i18next' },
  { text: 'Paraglide', link: '/guide/localisation/paraglide' },
  { text: 'Custom adapters', link: '/guide/localisation/custom-adapters' },
]

const Integrations = [
  { text: 'Nuxt', link: '/guide/nuxt' },
]

const Reference = [
  { text: 'useValidation', link: '/guide/reference/use-validation' },
  { text: 'Validation lifecycle', link: '/guide/reference/validation-lifecycle' },
  { text: 'Message resolution', link: '/guide/reference/messages' },
]

export default defineConfig({
  title: 'Verific - Model-Based Validation for Vue 3',
  description: 'Model-Based Validation for Vue 3',
  themeConfig: {
    search: {
      provider: 'local',
    },
    siteTitle: 'Verific',
    logo: '/logo.png',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/' },
      { text: 'Localisation', link: '/guide/localisation' },
      { text: 'Nuxt', link: '/guide/nuxt' },
    ],

    sidebar: [
      { text: 'Start', items: Start },
      { text: 'Core Concepts', items: CoreConcepts },
      { text: 'Localisation', items: Localisation },
      { text: 'Integrations', items: Integrations },
      { text: 'Reference', items: Reference },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/josephanson/verific' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@verific/core' },
    ],
  },
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' }],
    ['link', { rel: 'manifest', href: '/site.webmanifest' }],
  ],
})
