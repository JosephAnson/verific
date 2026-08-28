import type { LocalizedString, MessageMetadata } from '../runtime.js'

interface Inputs {
  minimum: NonNullable<unknown>
  count: NonNullable<unknown>
}
interface Options { locale?: 'en' | 'nl' }

export const errors_min_items: ((inputs: Inputs, options?: Options) => LocalizedString)
  & MessageMetadata<Inputs, Options, Record<never, never>>
