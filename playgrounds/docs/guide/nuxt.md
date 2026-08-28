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
const { errorsFor, hasError, validate, validateFor } = useValidation(schema, { email })

async function submit() {
  const result = await validate()
  if (result.success) {
    // Submit application-owned state.
  }
}
</script>

<template>
  <form novalidate @submit.prevent="submit">
    <label for="email">Email</label>
    <input
      id="email"
      v-model="email"
      type="email"
      :aria-invalid="hasError('email')"
      aria-describedby="email-errors"
      @blur="validateFor('email')"
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

The auto-imported `validateFor('email')` runs the complete schema and publishes
only that exact path; `validate()` remains the full submission gate. Without
localisation, `errorsFor()` returns the schema's error text. See the
[`useValidation` reference](./reference/use-validation) for scopes, paths and
the complete controller interface.

## Run the real Nuxt playground

The inline examples elsewhere in this guide prove Vue component behaviour. Nuxt module registration, auto-imports and request-local Vue I18n integration require a real Nuxt application, so they are exercised in the repository's [`playgrounds/nuxt`](https://github.com/josephanson/verific/tree/main/playgrounds/nuxt) application.

From the root of a cloned repository, run:

```bash
pnpm install
pnpm build
pnpm dev:nuxt
```

Open the URL printed by Nuxt. The playground source covers the auto-imported `useValidation`, descendant registration, automatic localisation, locale changes without revalidation, and both Zod and Valibot Standard Schema validators.

## Automatic Vue I18n integration

Install the optional localisation packages:

```bash
pnpm add @nuxtjs/i18n @verific/vue-i18n vue-i18n
```

Keep `nuxt.config.ts` serialisable. The module obtains the current request's
global Composer at runtime and creates an adapter for that Nuxt application.

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n', '@verific/nuxt'],
  i18n: {
    locales: ['en', 'es'],
    defaultLocale: 'en',
    vueI18n: './i18n.config.ts',
  },
  verific: {
    messages: {
      adapter: 'vue-i18n',
      fallbackPrefix: 'errors',
      missing: 'warn',
    },
  },
})
```

```ts [i18n/i18n.config.ts]
export default defineI18nConfig(() => ({
  legacy: false,
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
}))
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

The generated runtime plugin depends on Nuxt I18n's plugin and creates its
adapter from `nuxtApp.$i18n`. It does not share the Composer, locale or
missing-key diagnostics between server requests. Automatic integration requires
Vue I18n Composition API mode (`legacy: false`).

### Automatic options

| Option | Default | Purpose |
| --- | --- | --- |
| `verific.global` | `true` | Install Verific for each Nuxt application. |
| `verific.messages` | `false` | Disable localisation, or select the serialisable Vue I18n adapter. |
| `messages.adapter` | required | Must be `'vue-i18n'`. |
| `messages.fallbackPrefix` | none | Shared catalogue prefix tried after a form-specific key. |
| `messages.missing` | adapter default | Use `'warn'` or `'silent'` for runtime missing-key diagnostics. |

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

## Manual locale adapters

Automatic localisation is intentionally limited to Vue I18n because
`@nuxtjs/i18n` provides a stable request-local Composer. Use manual mode for
i18next, Paraglide, a custom resolver or any configuration containing runtime
functions:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@verific/nuxt'],
  verific: { global: false },
})
```

Manual mode keeps the `useValidation` auto-import but adds no Verific runtime
plugin and performs no localisation dependency checks. `global: false` cannot
be combined with module-level `messages`.

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

| Package | Supported range | Tested baseline |
| --- | --- | --- |
| Nuxt | `>=3.21 <5` | `3.21.11`, `4.5.2` |
| Nuxt I18n | `>=10.6 <11` | `10.6.0` |
| Vue I18n | `>=11.4 <12` | `11.4.10` |

Nuxt I18n, Vue I18n and `@verific/vue-i18n` are optional peers. Applications
that leave `verific.messages` disabled do not need them.

i18next and Paraglide are manual integrations and follow the compatibility
ranges in the [localisation overview](./localisation#compatibility).
