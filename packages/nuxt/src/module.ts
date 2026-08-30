import { fileURLToPath } from 'node:url'
import {
  addImports,
  addPlugin,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'

export interface ModuleOptions {
  /** Install the Verific Vue plugin automatically. @default true */
  readonly global?: boolean
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
  },
  setup(options, nuxt) {
    addImports({ name: 'useValidation', from: '@verific/core' })

    if (!options.global) {
      return
    }

    const { resolve } = createResolver(import.meta.url)
    const runtimeDir = fileURLToPath(new URL('./runtime', import.meta.url))

    nuxt.options.build.transpile.push(runtimeDir)

    addPlugin({
      src: resolve('./runtime/plugin'),
      name: 'verific:plugin',
      order: VERIFIC_PLUGIN_ORDER,
    })
  },
})
