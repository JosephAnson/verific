---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Verific"
  text: "Your model stays yours"
  tagline: "Validate the Vue state you already own, with error messages in your app's locale system."
  image:
    src: /logo.png
    alt: Verific
  actions:
    - theme: brand
      text: Getting Started
      link: /guide/
    - theme: alt
      text: Compare Verific
      link: /guide/comparison

features:
  - title: Keep your model and components
    details: "Add validation to existing refs or stores and connect it through your component library's own API."
    link: /guide/#basic-validation-demo
    linkText: Start with one form
  - title: Submit across components
    details: "Collect schemas and models from nested components into one validation scope."
    link: /guide/core/nested-validation
    linkText: Compose a form
  - title: Use your locale system
    details: "Turn validator issues into semantic identifiers and resolve error messages through your app's translation catalogue."
    link: /guide/localisation
    linkText: Localise errors
  - title: Use Verific with Nuxt
    details: "Configure validation once and use the same interface throughout a Nuxt application."
    link: /guide/nuxt
    linkText: Integrate with Nuxt
---
