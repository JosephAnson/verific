import type { Verific } from 'src/plugin'
import type { InjectionKey } from 'vue'

export const VERIFIC_SYMBOL = Symbol('verific') as InjectionKey<Verific>
