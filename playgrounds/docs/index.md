---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Verific"
  text: "Model validation for Vue"
  tagline: "Validate one Vue-owned model or coordinate schemas across a component tree"
  image:
    src: /logo.png
    alt: Verific Model-Based Validation
  actions:
    - theme: brand
      text: Getting Started
      link: /guide/
    - theme: alt
      text: Why Verific?
      link: /guide/why

features:
  - title: Validate one form
    details: "Connect a Standard Schema to a Vue-owned model and submit only valid data."
    link: /guide/#validate-one-model
    linkText: Start with one form
  - title: Compose descendant registrations
    details: "Collect schemas and models from nested components into one validation scope."
    link: /guide/core/nested-validation
    linkText: Compose a form
  - title: Render and localise errors
    details: "Turn structured issues into accessible error messages in the reader's locale."
    link: /guide/localisation
    linkText: Localise errors
  - title: Use Verific with Nuxt
    details: "Configure validation once and use the same interface throughout a Nuxt application."
    link: /guide/nuxt
    linkText: Integrate with Nuxt
---
