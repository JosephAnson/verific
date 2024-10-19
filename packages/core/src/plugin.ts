import { type App, effectScope, type EffectScope, markRaw, ref, type Ref } from 'vue'
import { VERIFIC_SYMBOL } from './utils/constants'

declare module 'vue' {
  interface ComponentCustomProperties {
    $verific: Verific
  }
}

export type StateTree = Record<string | number | symbol, any>

/**
 * Every application must own its own verific to be able to create stores
 */
export interface Verific {
  install: (app: App) => void

  /**
   * root state
   */
  state: Ref<Record<string, StateTree>>

  /**
   * App linked to this Verific instance
   *
   * @internal
   */
  _a: App

  /**
   * Effect scope the verific is attached to
   *
   * @internal
   */
  _e: EffectScope
}

/**
 * Creates a Verific instance to be used by the application
 */
export function createVerific(): Verific {
  const scope = effectScope(true)

  const state = scope.run<Ref<Record<string, StateTree>>>(() =>
    ref<Record<string, StateTree>>({}),
  )!

  // @ts-expect-error _a gets set on install
  const verific: Verific = markRaw({
    install: (app: App) => {
      verific._a = app
      app.provide(VERIFIC_SYMBOL, verific)
      app.config.globalProperties.$verific = verific
    },

    _a: null,
    _e: scope,
    state,
  })

  return verific
}

/**
 * Dispose a Verific instance by stopping its effectScope and removing the state, plugins and stores. This is mostly
 * useful in tests, with both a testing verific or a regular verific and in applications that use multiple verific instances.
 * Once disposed, the verific instance cannot be used anymore.
 *
 * @param verific - verific instance
 */
export function disposeVerific(verific: Verific) {
  verific._e.stop()
  verific.state.value = {}
  // @ts-expect-error: non valid
  verific._a = null
}
