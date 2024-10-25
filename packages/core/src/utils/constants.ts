import type { InjectionKey } from 'vue'
import type { Verific } from '../plugin'

export const VERIFIC_SYMBOL = Symbol('verific') as InjectionKey<Verific>
