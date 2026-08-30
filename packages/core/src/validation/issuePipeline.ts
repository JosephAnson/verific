import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  IssueNormaliser,
  MessagePolicy,
  MessageResolver,
  ValidationIssue,
  ValidationIssueContext,
} from '../messages'
import { describeBuiltInIssue } from '../issueNormalisers'
import { resolveIssueMessage } from '../messages'
import { normalisePath, resolveInput } from './paths'

export interface ValidationPolicyOptions {
  readonly messages?: MessageResolver
  readonly messagePrefix?: string
  readonly describeIssue?: IssueNormaliser
}

export interface IssuePipeline {
  createIssue: (
    raw: StandardSchemaV1.Issue,
    vendor: string,
    input: unknown,
  ) => ValidationIssue
}

interface IssuePolicySources {
  readonly registration: ValidationPolicyOptions
  readonly root: ValidationPolicyOptions
  readonly application?: ValidationPolicyOptions
  readonly creatingScope: boolean
}

const issuePolicies = new WeakMap<ValidationIssue, MessagePolicy>()

export function createIssuePipeline(
  at: readonly PropertyKey[],
  sources: IssuePolicySources,
): IssuePipeline {
  const localMessages = sources.creatingScope ? undefined : sources.registration.messages
  const localNormaliser = sources.creatingScope ? undefined : sources.registration.describeIssue
  const prefix = Object.freeze([...at])
  const messagePolicy: MessagePolicy = {
    prefix: sources.creatingScope
      ? sources.root.messagePrefix
      : sources.registration.messagePrefix ?? sources.root.messagePrefix,
    resolvers: uniqueValues([
      localMessages,
      sources.root.messages,
      sources.application?.messages,
    ]),
  }
  const normalisers = uniqueValues([
    localNormaliser,
    sources.root.describeIssue,
    sources.application?.describeIssue,
    describeBuiltInIssue,
  ])

  return {
    createIssue(raw, vendor, input) {
      const localPath = Object.freeze(normalisePath(raw.path))
      const path = Object.freeze([...prefix, ...localPath])
      const context: ValidationIssueContext = {
        raw,
        vendor,
        message: raw.message,
        localPath,
        path,
        input: resolveInput(input, localPath),
      }
      let semantic
      for (const normaliser of normalisers) {
        semantic = normaliser(context)
        if (semantic !== undefined) {
          break
        }
      }
      const issue: ValidationIssue = semantic === undefined
        ? { raw, vendor, message: raw.message, localPath, path }
        : { raw, vendor, message: raw.message, localPath, path, semantic }
      issuePolicies.set(issue, messagePolicy)
      return issue
    },
  }
}

export function resolveValidationMessage(issue: ValidationIssue): string {
  return resolveIssueMessage(issue, issuePolicies.get(issue) ?? { resolvers: [] })
}

function uniqueValues<Value>(values: readonly (Value | undefined)[]): Value[] {
  return [...new Set(values.filter((value): value is Value => value !== undefined))]
}
