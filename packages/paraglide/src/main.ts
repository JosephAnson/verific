import type { DiagnosticMessageAdapter } from '@verific/core'
import type { CatalogueMessagesOptions } from '@verific/i18n'
import { createCatalogueMessages } from '@verific/i18n'

export interface ParaglideMessagesOptions<Locale extends string>
  extends CatalogueMessagesOptions {
  /** Read the current request-owned, Vue-reactive locale. */
  readonly locale: () => Locale
}

/** Preserve the concrete input and locale options of every generated message. */
export type ParaglideFunctionMap<Messages extends Readonly<Record<string, unknown>>>
  = { readonly [Key in keyof Messages]:
    Messages[Key] extends (...arguments_: infer Arguments) => string
      ? (...arguments_: Arguments) => string
      : never }

type ParaglideFunctionLocale<Function_>
  = Function_ extends (...arguments_: infer Arguments) => string
    ? NonNullable<Arguments[1]> extends { locale?: infer Locale }
      ? Extract<Locale, string>
      : never
    : never

/** Locales accepted by the generated functions in a mapped catalogue. */
export type ParaglideMapLocale<Messages extends Readonly<Record<string, unknown>>>
  = { [Key in keyof Messages]: ParaglideFunctionLocale<Messages[Key]> }[keyof Messages]

type RuntimeMessage = (
  inputs: Readonly<Record<string, string | number | boolean | null>>,
  options: { readonly locale: string },
) => string

function hasOwnMessage(
  messages: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  return Object.getOwnPropertyDescriptor(messages, key) !== undefined
}

/** Create a Verific message resolver from explicitly selected Paraglide exports. */
export function paraglideMessages<
  const Messages extends Readonly<Record<string, unknown>>,
>(
  messages: Messages & ParaglideFunctionMap<Messages>,
  options: ParaglideMessagesOptions<ParaglideMapLocale<Messages>>,
): DiagnosticMessageAdapter {
  const { locale, ...catalogueOptions } = options

  return createCatalogueMessages({
    locales: () => [locale()],
    lookup(key, selectedLocale, context) {
      if (!hasOwnMessage(messages, key)) {
        return { resolved: false }
      }

      const message = messages[key] as unknown as RuntimeMessage
      const inputs: Record<string, string | number | boolean | null> = { ...context.values }
      delete inputs.count
      if (context.count !== undefined) {
        inputs.count = context.count
      }

      return {
        resolved: true,
        message: message(inputs, { locale: selectedLocale }),
      }
    },
  }, catalogueOptions)
}
