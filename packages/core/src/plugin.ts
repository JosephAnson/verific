import type { App } from 'vue'
import type { IssueNormaliser, MessageResolver } from './messages'
import { markRaw } from 'vue'
import { VERIFIC_SYMBOL } from './utils/constants'

declare module 'vue' {
  interface ComponentCustomProperties {
    $verific: Verific
  }
}

export interface VerificOptions {
  readonly messages?: MessageResolver
  readonly describeIssue?: IssueNormaliser
}

export interface Verific {
  readonly options: Readonly<VerificOptions>
  install: (app: App) => void
}

export function createVerific(options: VerificOptions = {}): Verific {
  const verific: Verific = markRaw({
    options: Object.freeze({ ...options }),
    install: (app: App) => {
      app.provide(VERIFIC_SYMBOL, verific)
      app.config.globalProperties.$verific = verific
    },
  })
  return verific
}
