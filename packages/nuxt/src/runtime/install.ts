import { createVerific } from '@verific/core'

interface NuxtAppLike {
  readonly vueApp: {
    use: (plugin: ReturnType<typeof createVerific>) => unknown
  }
}

export function installVerific(nuxtApp: NuxtAppLike): void {
  nuxtApp.vueApp.use(createVerific())
}
