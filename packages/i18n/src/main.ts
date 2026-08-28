import type {
  DiagnosticMessageAdapter,
  MessageContext,
  MissingMessageAttempt,
  MissingMessageDiagnostic,
} from '@verific/core'

export type MissingMessageMode
  = | 'silent'
    | 'warn'
    | 'throw'
    | ((diagnostic: CatalogueMissingMessageDiagnostic) => void)

export interface CatalogueKeyContext extends MessageContext {
  readonly fallbackPrefix?: string
  readonly defaultKeys: readonly string[]
}

export type CatalogueLookupResult
  = | { readonly resolved: true, readonly message: string }
    | { readonly resolved: false }

export interface CatalogueMissingMessageDiagnostic extends MissingMessageDiagnostic {
  readonly fallbackPrefix?: string
}

export interface CatalogueMessageDriver {
  /** Read the current native locale chain on every resolution. */
  readonly locales: () => readonly string[]
  /** Resolve one exact key and locale atomically, without native fallback. */
  readonly lookup: (
    key: string,
    locale: string,
    context: MessageContext,
  ) => CatalogueLookupResult
}

export interface CatalogueMessagesOptions {
  readonly fallbackPrefix?: string
  readonly missing?: MissingMessageMode
  readonly key?: (context: CatalogueKeyContext) => readonly string[]
}

const MAX_REPORTED_MISSES = 100

function isProduction(): boolean {
  try {
    // eslint-disable-next-line node/prefer-global/process -- Consumer bundlers replace this expression.
    return process.env.NODE_ENV === 'production'
  }
  catch {
    return false
  }
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function createDefaultKeys(context: MessageContext, fallbackPrefix?: string): readonly string[] {
  const keys: string[] = []

  if (
    context.messagePrefix !== undefined
    && context.path.every(segment => typeof segment === 'string' || typeof segment === 'number')
  ) {
    keys.push([context.messagePrefix, ...context.path.map(String), context.identifier].join('.'))
  }

  if (fallbackPrefix !== undefined) {
    keys.push(`${fallbackPrefix}.${context.identifier}`)
  }

  return unique(keys)
}

function missingPairs(attempts: readonly MissingMessageAttempt[]): readonly string[] {
  const pairs: string[] = []

  for (const attempt of attempts) {
    for (const key of attempt.keys) {
      pairs.push(JSON.stringify([attempt.locale ?? null, key]))
    }
  }

  return unique(pairs)
}

function diagnosticSummary(diagnostic: CatalogueMissingMessageDiagnostic): string {
  const location = diagnostic.path.map(String).join('.') || '(root)'
  const messagePrefix = diagnostic.messagePrefix ?? '(none)'
  const fallbackPrefix = diagnostic.fallbackPrefix ?? '(none)'
  const attempts = diagnostic.attempts
    .flatMap(attempt => attempt.keys.map(key => `${attempt.locale ?? 'unknown locale'}:${key}`))
    .join(', ')

  return `[Verific] Missing validation message for "${diagnostic.identifier}" at "${location}" (message prefix: "${messagePrefix}", fallback prefix: "${fallbackPrefix}"). Attempted ${attempts || '(no catalogue keys)'}.`
}

/** Create a Verific message resolver backed by an exact catalogue lookup driver. */
export function createCatalogueMessages(
  driver: CatalogueMessageDriver,
  options: CatalogueMessagesOptions = {},
): DiagnosticMessageAdapter {
  const missing = options.missing ?? (isProduction() ? 'silent' : 'warn')
  const reported = new Set<string>()

  function rememberNewPairs(attempts: readonly MissingMessageAttempt[]): boolean {
    const pairs = missingPairs(attempts)
    const hasNewPair = pairs.some(pair => !reported.has(pair))

    if (!hasNewPair) {
      return false
    }

    for (const pair of pairs) {
      if (reported.has(pair)) {
        continue
      }
      if (reported.size >= MAX_REPORTED_MISSES) {
        const oldest = reported.values().next().value
        if (oldest !== undefined) {
          reported.delete(oldest)
        }
      }
      reported.add(pair)
    }

    return true
  }

  return {
    resolve(context) {
      const defaultKeys = createDefaultKeys(context, options.fallbackPrefix)
      const keys = unique(options.key
        ? options.key({ ...context, fallbackPrefix: options.fallbackPrefix, defaultKeys })
        : defaultKeys)
      const locales = unique(driver.locales())
      const attempts: MissingMessageAttempt[] = []

      if (locales.length === 0) {
        return keys.length > 0
          ? { resolved: false, attempts: keys.map(key => ({ keys: [key] })) }
          : { resolved: false }
      }

      for (const key of keys) {
        for (const locale of locales) {
          const result = driver.lookup(key, locale, context)
          if (result.resolved) {
            return result
          }
          attempts.push({ locale, keys: [key] })
        }
      }

      return attempts.length > 0
        ? { resolved: false, attempts }
        : { resolved: false }
    },
    onMissing(diagnostic) {
      if (missing === 'silent') {
        return
      }

      const catalogueDiagnostic: CatalogueMissingMessageDiagnostic = {
        ...diagnostic,
        fallbackPrefix: options.fallbackPrefix,
      }

      if (missing === 'throw') {
        throw new Error(diagnosticSummary(catalogueDiagnostic))
      }

      if (!rememberNewPairs(diagnostic.attempts)) {
        return
      }

      if (missing === 'warn') {
        console.warn(diagnosticSummary(catalogueDiagnostic))
        return
      }

      missing(catalogueDiagnostic)
    },
  }
}
