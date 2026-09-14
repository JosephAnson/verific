import type { LocalizedString, MessageMetadata } from '../runtime.js'

type Inputs = Record<never, never>
interface Options { locale?: 'en' | 'nl' }

export const errors_required: ((inputs?: Inputs, options?: Options) => LocalizedString)
  & MessageMetadata<Inputs, Options, Record<never, never>>
