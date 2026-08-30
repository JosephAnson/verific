import type { StandardSchemaV1 } from '@standard-schema/spec'

export interface ResolvedInput {
  readonly present: boolean
  readonly value: unknown
}

export function selectorSegments(path: unknown): readonly PropertyKey[] {
  return Array.isArray(path) ? path : [path as PropertyKey]
}

export function normalisePath(path: StandardSchemaV1.Issue['path']): PropertyKey[] {
  return path?.map(segment => typeof segment === 'object' && segment !== null && 'key' in segment
    ? segment.key
    : segment) ?? []
}

export function pathsEqual(actual: readonly PropertyKey[], expected: readonly PropertyKey[]): boolean {
  return actual.length === expected.length && actual.every((segment, index) => Object.is(segment, expected[index]))
}

export function pathStartsWith(path: readonly PropertyKey[], prefix: readonly PropertyKey[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => Object.is(segment, path[index]))
}

export function resolveInput(input: unknown, path: readonly PropertyKey[]): ResolvedInput {
  let value = input
  if (path.length === 0) {
    return { present: true, value }
  }
  for (const segment of path) {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null || !Object.hasOwn(value, segment)) {
      return { present: false, value: undefined }
    }
    value = Reflect.get(value, segment)
  }
  return { present: true, value }
}
