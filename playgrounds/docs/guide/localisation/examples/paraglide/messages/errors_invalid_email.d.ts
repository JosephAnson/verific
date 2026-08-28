import type { LocalizedString, MessageMetadata } from '../runtime.js'

type Inputs = Record<never, never>
interface Options { locale?: 'en' | 'es' }

export const errors_invalid_email: ((inputs?: Inputs, options?: Options) => LocalizedString)
  & MessageMetadata<Inputs, Options, Record<never, never>>
