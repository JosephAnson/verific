import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { MaybeRef } from 'vue'
import { unref } from 'vue'

/**
 * Validates data using a Standard Schema compliant validator
 * @param schema The schema to validate against
 * @param data The data to validate
 * @returns A promise that resolves to the validation result
 */
export async function validateWithStandardSchema<T>(
  schema: StandardSchemaV1,
  data: unknown
): Promise<StandardSchemaV1.Result<T>> {
  let result = schema['~standard'].validate(data)
  
  // Handle both synchronous and asynchronous validation
  if (result instanceof Promise) {
    result = await result
  }
  
  return result as StandardSchemaV1.Result<T>
}

/**
 * Extracts error messages from a Standard Schema failure result
 * @param result The validation result
 * @returns An array of error messages
 */
export function getErrorMessages(
  result: StandardSchemaV1.FailureResult
): string[] {
  if (!result.issues || result.issues.length === 0) {
    return []
  }
  
  return result.issues.map(issue => issue.message)
}

/**
 * Checks if a value is a Standard Schema compliant validator
 * @param value The value to check
 * @returns True if the value is a Standard Schema compliant validator
 */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    typeof value === 'object' &&
    value !== null &&
    '~standard' in value &&
    typeof (value as any)['~standard'] === 'object' &&
    typeof (value as any)['~standard'].validate === 'function' &&
    typeof (value as any)['~standard'].vendor === 'string' &&
    (value as any)['~standard'].version === 1
  )
}

/**
 * Unwraps a MaybeRef value and ensures it's a Standard Schema compliant validator
 * @param schema The schema to unwrap
 * @returns The unwrapped schema
 * @throws If the schema is not a Standard Schema compliant validator
 */
export function unwrapSchema<T>(schema: MaybeRef<any>): StandardSchemaV1<T, T> {
  const unwrappedSchema = unref(schema)
  
  if (!isStandardSchema(unwrappedSchema)) {
    throw new Error('The provided schema is not a Standard Schema compliant validator')
  }
  
  return unwrappedSchema as StandardSchemaV1<T, T>
} 