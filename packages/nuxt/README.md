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

Localisation is optional. The module can create a request-local Vue I18n
adapter, or leave installation to an application plugin for another locale
library.

Read the canonical [Nuxt guide](https://verific.josephanson.com/guide/nuxt) for
automatic and manual configuration, compatibility and examples. See the
[`useValidation` reference](https://verific.josephanson.com/guide/reference/use-validation)
for the auto-imported composable.

## Licence

MIT
