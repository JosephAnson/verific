import { fileURLToPath } from 'node:url'
import {
  addImports,
  addPlugin,
  addPluginTemplate,
  createResolver,
  defineNuxtModule,
  tryResolveModule,
} from '@nuxt/kit'

export interface VueI18nModuleMessages {
  readonly adapter: 'vue-i18n'
  readonly fallbackPrefix?: string
  readonly missing?: 'warn' | 'silent'
}

export type ModuleOptions
  = | {
    /** Install the Verific Vue plugin automatically. @default true */
    readonly global?: true
    /** Select a serialisable application message adapter. @default false */
    readonly messages?: false | VueI18nModuleMessages
  }
  | {
    /** Use an application plugin to install Verific manually. */
    readonly global: false
    readonly messages?: never
  }

interface ResolvedModuleOptions {
  readonly global: boolean
  readonly messages: unknown
}

const VERIFIC_PLUGIN_ORDER = 20

export default defineNuxtModule<ModuleOptions>().with({
  meta: {
    name: '@verific/nuxt',
    configKey: 'verific',
    compatibility: {
      nuxt: '>=3.21.0 <5.0.0',
    },
  },
  defaults: {
    global: true,
    messages: false,
  },
  async setup(options: ResolvedModuleOptions, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    const runtimeDir = fileURLToPath(new URL('./runtime', import.meta.url))

    nuxt.options.build.transpile.push(runtimeDir)

    addImports({ name: 'useValidation', from: '@verific/core' })

    if (!options.global) {
      if (options.messages !== false && options.messages !== undefined) {
        throw new Error(
          '[Verific] `global: false` cannot be combined with module-level `messages`. Install `createVerific({ messages })` from an application plugin instead.',
        )
      }
      return
    }

    if (options.messages === undefined || options.messages === false) {
      addPlugin({
        src: resolve('./runtime/plugin'),
        name: 'verific:plugin',
        order: VERIFIC_PLUGIN_ORDER,
      })
      return
    }

    assertVueI18nMessages(options.messages)
    await requireOptionalPeer('@verific/vue-i18n', 'Install `@verific/vue-i18n` and `vue-i18n >=11.4 <12`, or disable `verific.messages`.')
    await requireOptionalPeer('@nuxtjs/i18n', 'Install and register `@nuxtjs/i18n >=10.6 <11`, or use `global: false` and install Verific manually.')

    const adapterOptions = JSON.stringify({
      fallbackPrefix: options.messages.fallbackPrefix,
      missing: options.messages.missing,
    })
    const runtimeInstall = resolve('./runtime/install')

    addPluginTemplate({
      filename: 'verific.vue-i18n.mjs',
      name: 'verific:plugin',
      order: VERIFIC_PLUGIN_ORDER,
      getContents: () => `import { vueI18nMessages } from '@verific/vue-i18n'
import { defineNuxtPlugin } from '#app'
import { installVueI18nVerific } from ${JSON.stringify(runtimeInstall)}

export default defineNuxtPlugin({
  name: 'verific:plugin',
  order: ${VERIFIC_PLUGIN_ORDER},
  dependsOn: ['i18n:plugin'],
  setup(nuxtApp) {
    installVueI18nVerific(nuxtApp, ${adapterOptions}, vueI18nMessages)
  },
})
`,
    }, { append: true })
  },
})

async function requireOptionalPeer(packageName: string, instruction: string): Promise<void> {
  if (await tryResolveModule(packageName, import.meta.url)) {
    return
  }

  throw new Error(`[Verific] Vue I18n message integration requires \`${packageName}\`. ${instruction}`)
}

function assertVueI18nMessages(value: unknown): asserts value is VueI18nModuleMessages {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throwInvalidMessages()
  }

  const config = value as Record<PropertyKey, unknown>
  const keys = Object.keys(config)
  const hasOnlyStaticOptions = keys.every(key => key === 'adapter' || key === 'fallbackPrefix' || key === 'missing')
  const hasValidFallback = config.fallbackPrefix === undefined || typeof config.fallbackPrefix === 'string'
  const hasValidMissing = config.missing === undefined || config.missing === 'warn' || config.missing === 'silent'

  if (config.adapter !== 'vue-i18n' || !hasOnlyStaticOptions || !hasValidFallback || !hasValidMissing) {
    throwInvalidMessages()
  }
}

function throwInvalidMessages(): never {
  throw new Error(
    '[Verific] `verific.messages` must be `false` or a serialisable `{ adapter: \'vue-i18n\', fallbackPrefix?: string, missing?: \'warn\' | \'silent\' }` object. Use `global: false` for runtime functions or custom adapters.',
  )
}
