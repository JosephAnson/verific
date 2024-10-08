import type { ComputedRef, InjectionKey, Ref } from 'vue'

export const VERIFIC_WATCH_TARGETS_KEY = Symbol('verific-watch-targets') as InjectionKey<Array<Ref<any> | ComputedRef<any>>>
