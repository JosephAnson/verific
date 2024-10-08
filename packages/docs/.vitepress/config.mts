import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
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
      { text: 'Introduction', link: '/why' },
      {
        text: 'Playground',
        link: 'https://stackblitz.com/edit/vaxee-playground?file=src%2FApp.vue',
      },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Why Verific?', link: '/why' },
          { text: 'Getting Started', link: '/getting-started' },
        ],
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'Service Layer to Validation', link: '/service-layer-to-validation' },
        ],
      },
      {
        text: 'Nuxt Integration',
        items: [
          { text: 'Nuxt Plugin Guide', link: '/nuxt' },
        ],
      },
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
