import type { App, ComputedRef, Ref } from 'vue'
import { VERIFIC_WATCH_TARGETS_KEY } from './utils/constants'
import { useProvideValidate, useValidate } from './main'

interface VerificPluginOptions {
  watchTargets?: Array<Ref<any> | ComputedRef<any>>
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $useProvideValidate: typeof useProvideValidate
    $useValidate: typeof useValidate
  }
}

export default {
  install: (app: App, options: VerificPluginOptions = {}) => {
    // inject a globally available $translate() method
    app.config.globalProperties.$useProvideValidate = useProvideValidate
    app.config.globalProperties.$useValidate = useValidate

    if (options.watchTargets && Array.isArray(options.watchTargets)) {
      app.provide(VERIFIC_WATCH_TARGETS_KEY, options.watchTargets)
    }
  },
}
