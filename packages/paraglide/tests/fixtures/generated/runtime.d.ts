export type LocalizedString = string & { readonly __brand: unique symbol }

export interface MessageMetadata<Inputs, Options, Matchers> {
  readonly __inputs?: Inputs
  readonly __options?: Options
  readonly __matchers?: Matchers
}

export const experimentalStaticLocale: undefined
export function getLocale(): 'en'
