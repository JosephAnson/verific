import type { IssueNormaliser, SemanticIssue, ValidationIssueContext } from './messages'

type NativeIssue = Record<PropertyKey, unknown>

export const describeBuiltInIssue: IssueNormaliser = (context) => {
  try {
    if (!isRecord(context.raw)) {
      return undefined
    }
    if (context.vendor === 'zod') {
      return describeZodIssue(context, context.raw)
    }
    if (context.vendor === 'valibot') {
      return describeValibotIssue(context, context.raw)
    }
  }
  catch {
    // Vendor shape guards must never turn a validation failure into an exception.
  }
  return undefined
}

function describeZodIssue(context: ValidationIssueContext, issue: NativeIssue): SemanticIssue | undefined {
  switch (issue.code) {
    case 'invalid_type':
      return typeIssue(context, issue.expected)
    case 'invalid_format':
      return formatIssue(issue.format)
    case 'invalid_string':
      return formatIssue(issue.validation)
    case 'too_small':
      return lowerBoundIssue(issue.origin ?? issue.type, issue.minimum, issue.inclusive)
    case 'too_big':
      return upperBoundIssue(issue.origin ?? issue.type, issue.maximum, issue.inclusive)
    default:
      return undefined
  }
}

function describeValibotIssue(context: ValidationIssueContext, issue: NativeIssue): SemanticIssue | undefined {
  switch (issue.type) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'array':
    case 'object':
    case 'date':
      if (issue.kind === 'schema') {
        if (issue.type === 'date' && context.input.value instanceof Date) {
          return semantic('invalidDate')
        }
        return typeIssue(context, issue.type)
      }
      return undefined
    case 'email':
      return semantic('invalidEmail')
    case 'url':
      return semantic('invalidUrl')
    case 'regex':
      return semantic('pattern')
    case 'min_length':
      return numericSemantic('minLength', 'minimum', issue.requirement, true)
    case 'max_length':
      return numericSemantic('maxLength', 'maximum', issue.requirement, true)
    case 'min_value':
      return numericSemantic('minimum', 'minimum', issue.requirement, false, true)
    case 'max_value':
      return numericSemantic('maximum', 'maximum', issue.requirement, false, true)
    case 'gt_value':
      return numericSemantic('minimum', 'minimum', issue.requirement, false, false)
    case 'lt_value':
      return numericSemantic('maximum', 'maximum', issue.requirement, false, false)
    default:
      return undefined
  }
}

function typeIssue(context: ValidationIssueContext, expected: unknown): SemanticIssue {
  if (!context.input.present || context.input.value === undefined) {
    return semantic('required')
  }
  if (
    expected === 'date'
    && context.input.value instanceof Date
    && Number.isNaN(context.input.value.getTime())
  ) {
    return semantic('invalidDate')
  }
  return typeof expected === 'string'
    ? semantic('invalidType', { expected })
    : semantic('invalidType')
}

function formatIssue(format: unknown): SemanticIssue | undefined {
  if (format === 'email') {
    return semantic('invalidEmail')
  }
  if (format === 'url') {
    return semantic('invalidUrl')
  }
  if (format === 'regex' || format instanceof RegExp) {
    return semantic('pattern')
  }
  if (isRecord(format) && 'regex' in format) {
    return semantic('pattern')
  }
  return undefined
}

function lowerBoundIssue(origin: unknown, bound: unknown, inclusive: unknown): SemanticIssue | undefined {
  if (origin === 'string' || origin === 'array') {
    return numericSemantic('minLength', 'minimum', bound, true)
  }
  if (origin === 'number') {
    return numericSemantic('minimum', 'minimum', bound, false, inclusive === true)
  }
  return undefined
}

function upperBoundIssue(origin: unknown, bound: unknown, inclusive: unknown): SemanticIssue | undefined {
  if (origin === 'string' || origin === 'array') {
    return numericSemantic('maxLength', 'maximum', bound, true)
  }
  if (origin === 'number') {
    return numericSemantic('maximum', 'maximum', bound, false, inclusive === true)
  }
  return undefined
}

function numericSemantic(
  identifier: 'minLength' | 'maxLength' | 'minimum' | 'maximum',
  key: 'minimum' | 'maximum',
  value: unknown,
  count: boolean,
  inclusive?: boolean,
): SemanticIssue | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  const values = identifier === 'minimum' || identifier === 'maximum'
    ? { [key]: value, inclusive: inclusive === true }
    : { [key]: value }
  return semantic(identifier, values, count ? value : undefined)
}

function semantic(
  identifier: string,
  values: Record<string, string | number | boolean | null> = {},
  count?: number,
): SemanticIssue {
  return count === undefined ? { identifier, values } : { identifier, values, count }
}

function isRecord(value: unknown): value is NativeIssue {
  return (typeof value === 'object' || typeof value === 'function') && value !== null
}
