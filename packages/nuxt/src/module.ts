import { fileURLToPath } from 'node:url'
import { addImports, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import { defu } from 'defu'

export interface ModuleOptions {
  /**
   * Enable or disable the Verific plugin globally
   * @default true
   */
  global?: boolean

  /**
   * Configuration options for Verific
   * @default {}
   */
  config?: {
    /**
     * Use keys over strings for error messages
     * @default false
     */
    useKeysOverStrings?: boolean
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@verific/nuxt',
    configKey: 'verific',
    compatibility: {
      nuxt: '^3.0.0',
    },
  },
  defaults: {
    global: true,
    config: {
      useKeysOverStrings: false,
    },
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    const runtimeDir = fileURLToPath(new URL('./runtime', import.meta.url))

    // Transpile runtime
    nuxt.options.build.transpile.push(runtimeDir)

    // Add Verific plugin
    if (options.global) {
      addPlugin(resolve('./runtime/plugin'))
    }

    // Add Verific composables
    addImports([
      { name: 'useValidate', as: 'useValidate', from: '@verific/core' },
      { name: 'createValidationScope', as: 'createValidationScope', from: '@verific/core' },
      { name: 'useError', as: 'useError', from: '@verific/core' },
      { name: 'createMessageArray', as: 'createMessageArray', from: '@verific/core' },
    ])

    // Add runtime config
    nuxt.options.runtimeConfig.public.verific = defu(
      nuxt.options.runtimeConfig.public.verific || {},
      {
        config: options.config,
      },
    )
  },
})

// Module type augmentation for Typescript
declare module '@nuxt/schema' {
  interface ConfigSchema {
    publicRuntimeConfig?: {
      verific?: {
        config?: {
          useKeysOverStrings?: boolean
        }
      }
    }
  }
}
