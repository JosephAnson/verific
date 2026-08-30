# `@verific/nuxt`

Nuxt integration for [Verific](https://verific.josephanson.com/). It
auto-imports `useValidation` and installs Verific once per Nuxt application.

```bash
pnpm add @verific/core @verific/nuxt zod
```

```ts
export default defineNuxtConfig({
  modules: ['@verific/nuxt'],
})
```

Localisation is application-owned. Set `verific.global` to `false`, then create
the locale library and Verific inside an application plugin so every server
request receives fresh state.

Read the canonical [Nuxt guide](https://verific.josephanson.com/guide/nuxt) for
configuration, request-local localisation and examples. See the
[`useValidation` reference](https://verific.josephanson.com/guide/reference/use-validation)
for the auto-imported composable.

## Licence

MIT
