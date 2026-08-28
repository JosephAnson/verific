import type { StandardSchemaV1 } from '@standard-schema/spec'

export interface SemanticIssue {
  readonly identifier: string
  readonly values: Readonly<Record<string, string | number | boolean | null>>
  readonly count?: number
}

export interface ValidationIssue {
  readonly raw: StandardSchemaV1.Issue
  readonly vendor: string
  readonly message: string
  readonly localPath: readonly PropertyKey[]
  readonly path: readonly PropertyKey[]
  readonly semantic?: SemanticIssue
}

export interface ValidationIssueContext {
  readonly raw: StandardSchemaV1.Issue
  readonly vendor: string
  readonly message: string
  readonly localPath: readonly PropertyKey[]
  readonly path: readonly PropertyKey[]
  readonly input: {
    readonly present: boolean
    readonly value: unknown
  }
}

export type IssueNormaliser = (issue: ValidationIssueContext) => SemanticIssue | undefined

export interface MessageContext {
  readonly issue: ValidationIssue
  readonly path: readonly PropertyKey[]
  readonly identifier: string
  readonly values: Readonly<Record<string, string | number | boolean | null>>
  readonly count?: number
  readonly messagePrefix?: string
  readonly defaultMessage: string
}

export type MessageResolution
  = | { readonly resolved: true, readonly message: string }
    | {
      readonly resolved: false
      /** Retained for existing third-party adapters. */
      readonly attempt?: MissingMessageAttempt
      /** Complete ordered attempts for adapters that perform several lookups. */
      readonly attempts?: readonly MissingMessageAttempt[]
    }

export type MessageResolverFunction = (context: MessageContext) => string | undefined

export interface MissingMessageAttempt {
  readonly locale?: string
  readonly keys: readonly string[]
}

export interface MissingMessageDiagnostic {
  readonly messagePrefix?: string
  readonly path: readonly PropertyKey[]
  readonly identifier: string
  readonly attempts: readonly MissingMessageAttempt[]
}

export interface DiagnosticMessageAdapter {
  resolve: (context: MessageContext) => MessageResolution
  onMissing?: (diagnostic: MissingMessageDiagnostic) => void
}

export type MessageResolver = MessageResolverFunction | DiagnosticMessageAdapter

export interface MessagePolicy {
  readonly prefix?: string
  readonly resolvers: readonly MessageResolver[]
}

export function resolveIssueMessage(issue: ValidationIssue, policy: MessagePolicy): string {
  const semantic = issue.semantic
  const context: MessageContext = {
    issue,
    path: issue.path,
    identifier: semantic?.identifier ?? 'invalid',
    values: semantic?.values ?? {},
    count: semantic?.count,
    messagePrefix: policy.prefix,
    defaultMessage: issue.message,
  }
  const attempts: MissingMessageAttempt[] = []
  let missingOwner: DiagnosticMessageAdapter | undefined
  const seen = new Set<MessageResolver>()

  for (const resolver of policy.resolvers) {
    if (seen.has(resolver)) {
      continue
    }
    seen.add(resolver)

    if (typeof resolver === 'function') {
      const message = resolver(context)
      if (message !== undefined) {
        return message
      }
      continue
    }

    const resolution = resolver.resolve(context)
    if (resolution.resolved) {
      return resolution.message
    }
    const contributedAttempts = resolution.attempts ?? (resolution.attempt ? [resolution.attempt] : [])
    if (contributedAttempts.length > 0) {
      attempts.push(...contributedAttempts)
      missingOwner ??= resolver.onMissing ? resolver : undefined
    }
  }

  missingOwner?.onMissing?.({
    messagePrefix: policy.prefix,
    path: issue.path,
    identifier: context.identifier,
    attempts,
  })

  return issue.message
}
