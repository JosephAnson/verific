---
outline: deep
---

# Nuxt

`@verific/nuxt` auto-imports `useValidation` and, by default, installs Verific
once for each Nuxt application. You can validate without configuring a plugin
yourself.

## Install

```bash
pnpm add @verific/core @verific/nuxt zod
```

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@verific/nuxt'],
})
```

## Validate a form

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { z } from 'zod'

const email = ref('')
const schema = z.object({ email: z.string().email() })
const { errorsFor, hasError, state, touch, validate, validateAt } = useValidation(schema, { email })

async function onEmailBlur() {
  touch('email')
  await validateAt('email')
}

async function submit() {
  const result = await validate()
  if (result.success && state.value.validated && !state.value.stale) {
    // Submit application-owned state.
  }
}
</script>

<template>
  <form novalidate aria-describedby="nuxt-required-instructions" @submit.prevent="submit">
    <p id="nuxt-required-instructions">
      Email is required.
    </p>
    <label for="email">Email</label>
    <input
      id="email"
      v-model="email"
      type="email"
      required
      :aria-invalid="hasError('email')"
      aria-describedby="email-errors"
      @blur="onEmailBlur"
    >
    <div id="email-errors" aria-live="polite" aria-atomic="true">
      <p v-for="(error, index) in errorsFor('email')" :key="`${index}:${error}`">
        {{ error }}
      </p>
    </div>
    <button type="submit">
      Submit
    </button>
  </form>
</template>
```

The auto-imported `validateAt('email')` runs the complete schema and publishes
only that exact path. `touch('email')` records the blur separately, while
`validate()` remains the full submission gate. Without localisation,
`errorsFor()` returns the schema's error text. See the
[`useValidation` reference](./reference/use-validation) for scopes, paths and
the complete controller interface.

## Run the real Nuxt playground

The inline examples elsewhere in this guide prove Vue component behaviour. Nuxt
module registration, auto-imports and request-local Vue I18n setup require a
real Nuxt application, so they are exercised in the repository's
[`playgrounds/nuxt`](https://github.com/josephanson/verific/tree/main/playgrounds/nuxt)
application.

From the root of a cloned repository, run:

```bash
pnpm install
pnpm build
pnpm dev:nuxt
```

Open the URL printed by Nuxt. The playground source covers the auto-imported
`useValidation`, descendant registration, request-local localisation, locale
changes without revalidation, and both Zod and Valibot Standard Schema
validators.

## Request-local Vue I18n

Install the adapter and its tested Vue I18n version:

```bash
pnpm add @verific/core @verific/nuxt @verific/vue-i18n vue-i18n@11.1.12
```

Disable the module's default Verific plugin. It still auto-imports
`useValidation`.

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@verific/nuxt'],
  verific: { global: false },
})
```

```ts [i18n/i18n.config.ts]
export default function createI18nOptions() {
  return {
    legacy: false as const,
    locale: 'en',
    fallbackLocale: 'en',
    messages: {
      en: {
        forms: {
          signup: {
            email: { invalidEmail: 'Enter a valid email address' },
          },
        },
        errors: {
          invalidEmail: 'Enter a valid email address',
        },
      },
    },
  }
}
```

Create both Vue I18n and Verific inside the Nuxt plugin. Nuxt runs this function
for each application, so server requests do not share a mutable Composer or
Verific adapter.

```ts [plugins/verific.ts]
import { createVerific } from '@verific/core'
import { vueI18nMessages } from '@verific/vue-i18n'
import { createI18n } from 'vue-i18n'
import createI18nOptions from '~/i18n/i18n.config'

export default defineNuxtPlugin((nuxtApp) => {
  const i18n = createI18n(createI18nOptions())

  nuxtApp.vueApp.use(i18n)
  nuxtApp.vueApp.use(createVerific({
    messages: vueI18nMessages(i18n.global, {
      fallbackPrefix: 'errors',
      missing: 'warn',
    }),
  }))
})
```

The following focused addition selects the form catalogue in the
[complete accessible form above](#validate-a-form):

```ts
const { errorsFor, validate } = useValidation(schema, { email }, {
  messagePrefix: 'forms.signup',
})
```

For an email issue, the adapter first tries a form-specific key such as
`forms.signup.email.invalidEmail`, then `errors.invalidEmail`, then the schema's
original text. Changing locale updates derived errors without another validation
run. Start with [Localisation](./localisation) for the shared-catalogue workflow,
then use the [Vue I18n adapter guide](./localisation/vue-i18n) for local
Composers, missing-key checks and library-specific behaviour.

The plugin owns installation order directly and uses Vue I18n Composition API
mode (`legacy: false`). It does not expose a `$i18n` compatibility shim.

### Module option

| Option | Default | Purpose |
| --- | --- | --- |
| `verific.global` | `true` | Install Verific for each Nuxt application. |

## Component-local Vue I18n catalogue

A form can try a component-local catalogue before the application adapter. The
following block is a focused replacement for the `useValidation` call in the
[complete accessible form](#validate-a-form):

```ts
import { vueI18nMessages } from '@verific/vue-i18n'

const composer = useI18n({
  useScope: 'local',
  messages: localMessages,
})
composer.fallbackRoot = false

const { errorsFor, validate } = useValidation(schema, { email }, {
  messagePrefix: 'forms.checkout',
  messages: vueI18nMessages(composer),
})
```

Set `fallbackRoot` to `false`. Otherwise Vue I18n could resolve through its
global Composer before Verific can apply its resolver order.

## Other locale adapters

Use the same application-plugin boundary for i18next, Paraglide or a custom
resolver:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@verific/nuxt'],
  verific: { global: false },
})
```

`global: false` keeps the `useValidation` auto-import but adds no Verific runtime
plugin and performs no localisation dependency checks.

### Manual i18next plugin

Create the i18next instance and adapter inside the Nuxt plugin execution. On
the server this is request-owned; on the client it is application-owned. The
same instance is supplied to i18next-vue and Verific.

```ts [plugins/verific-i18next.ts]
import { createVerific } from '@verific/core'
import { i18nextMessages } from '@verific/i18next'
import { createInstance } from 'i18next'
import I18NextVue from 'i18next-vue'

export default defineNuxtPlugin(async (nuxtApp) => {
  const i18n = createInstance()
  await i18n.init({
    fallbackLng: 'en',
    lng: 'en',
    resources: {
      en: { translation: { errors: { invalidEmail: 'Enter a valid email address' } } },
      es: { translation: { errors: { invalidEmail: 'Introduce una dirección de correo válida' } } },
    },
  })

  const messages = i18nextMessages(i18n, {
    fallbackPrefix: 'errors',
  })

  nuxtApp.vueApp.use(I18NextVue, { i18next: i18n })
  nuxtApp.vueApp.use(createVerific({ messages }))

  if (import.meta.server)
    nuxtApp.hook('app:rendered', messages.dispose)
})
```

The adapter's `dispose()` is idempotent and removes its language, catalogue-load
and resource-store listeners after each server render. On the client, the
adapter and its listeners intentionally live for the Nuxt application's
lifetime. Never export the mutable instance from a server module. See the
[i18next adapter guide](./localisation/i18next) for form usage and strict
missing-key tests.

### Manual Paraglide plugin

Import generated functions explicitly and use Nuxt request state as the required
locale source:

```ts [plugins/verific-paraglide.ts]
import { createVerific } from '@verific/core'
import { paraglideMessages } from '@verific/paraglide'
import * as m from '~/paraglide/messages.js'

export default defineNuxtPlugin((nuxtApp) => {
  const locale = useState<'en' | 'es'>('message-locale', () => 'en')
  const messages = paraglideMessages({
    'errors.required': m.errors_required,
    'errors.invalidEmail': m.errors_invalid_email,
  }, {
    fallbackPrefix: 'errors',
    locale: () => locale.value,
  })

  nuxtApp.vueApp.use(createVerific({ messages }))
})
```

Nuxt scopes `useState()` to the current server request and hydrates it for the
client application. The getter therefore remains reactive without consulting a
mutable process-global Paraglide locale. See the [Paraglide adapter
guide](./localisation/paraglide) for form usage, explicit mapping and strict
missing-key tests.

## Supported versions

| Integration | Direct dependency | Supported range | Tested baseline |
| --- | --- | --- | --- |
| `@verific/nuxt` | Nuxt | `>=3.21 <5` | `3.21.11`, `4.5.2` |
| `@verific/vue-i18n` | Vue I18n | `>=11.1.12 <11.2` | `11.1.12` |

`@verific/nuxt` has no Vue I18n, Nuxt I18n or adapter peer. Applications install
only the locale runtime and adapter they use.

i18next and Paraglide are manual integrations and follow the compatibility
ranges in the [localisation overview](./localisation#compatibility).
