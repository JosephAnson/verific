import type { App } from 'vue'
import { markRaw } from 'vue'
import { VERIFIC_SYMBOL } from './utils/constants'

declare module 'vue' {
  interface ComponentCustomProperties {
    $verific: Verific
  }
}

/**
 * Every application must own its own verific to be able to create stores
 */
export interface Verific {
  install: (app: App) => void
  options: VerificOptions
}

export interface VerificOptions {
  useKeysOverStrings?: boolean
}

/**
 * Creates a Verific instance to be used by the application
 */
export function createVerific(options: VerificOptions): Verific {
  const verific: Verific = markRaw({
    install: (app: App) => {
      app.provide(VERIFIC_SYMBOL, verific)
      app.config.globalProperties.$verific = verific
    },
    options,
  })

  return verific
}
