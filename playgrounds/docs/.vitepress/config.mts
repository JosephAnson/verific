import { defineConfig } from 'vitepress'

const Guide = [
  { text: 'Getting Started', link: '/guide' },
  { text: 'Why Verific?', link: '/guide/why' },
]

const Components = [
  { text: 'Error Messages', link: '/guide/components/error-messages' },
]

const CoreConcepts = [
  { text: 'Service Layer to Validation', link: '/guide/core/service-layer-to-validation' },
  { text: 'Nested Validation', link: '/guide/core/nested-validation' },
]

const Integrations = [
  { text: 'Nuxt Plugin Guide', link: '/guide/nuxt' },
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
      { text: 'Introduction', link: '/guide/why' },
      // { text: 'Playground', link: 'https://stackblitz.com/edit/verific-playground' },
    ],

    sidebar: [
      { text: 'Guide', items: Guide },
      { text: 'Components', items: Components },
      { text: 'Core Concepts', items: CoreConcepts },
      { text: 'Integrations', items: Integrations },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/josephanson/verific' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/verific' },
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
